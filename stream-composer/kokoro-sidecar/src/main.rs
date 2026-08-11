// ============================================================================
// KOKORO SIDECAR — a tiny standalone HTTP server wrapping the kokoro-en
// crate (Apache-2.0, https://github.com/pguso/kokoro), bundled into Stream
// Composer Suite as a Tauri externalBin sidecar.
//
// WHY A LOCAL HTTP SERVER, NOT A TAURI COMMAND: the actual TTS playback
// happens inside the BAKED overlay (scene.html) running in OBS's Browser
// Source - a separate Chromium context with no Tauri IPC bridge at
// runtime, same reason the Polly connector in chat-tts-engine.js talks to
// AWS over plain fetch() instead of a Tauri command. Pointing that same
// fetch() call at http://127.0.0.1:<port> instead of a remote host is the
// only architecture that works from inside a Browser Source - see
// ROADMAP.md's Kokoro section for the full reasoning.
//
// LIFECYCLE, worth understanding before touching this: this process is
// spawned DETACHED from the Stream Composer Suite editor app (see
// src-tauri/src/lib.rs's kokoro_start command) specifically so it keeps
// running after the editor closes - a streamer's actual OBS session
// usually outlives the design tool by hours. It does NOT auto-start on
// its own; the editor app is responsible for launching it (and the user
// needs to keep it running, exactly like they already need to keep OBS
// itself running - not a new operational burden, the same one).
//
// CORS: permissive (Access-Control-Allow-Origin: *) is deliberate, not an
// oversight - this only ever binds to 127.0.0.1, so the exposure is
// "anything already running on this machine can call it," not a real
// network-facing risk. The baked overlay loads as a local file inside a
// Browser Source, which counts as a different origin from this server as
// far as the browser's CORS check is concerned, so it needs this to work
// at all - same reasoning as any other localhost dev server.
// ============================================================================

use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use kokoro_en::{KokoroTts, Voice};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tower_http::cors::{Any, CorsLayer};

struct AppState {
    tts: Mutex<KokoroTts>,
}

#[derive(Deserialize)]
struct SynthesizeRequest {
    text: String,
    voice: String,
    #[serde(default = "default_speed")]
    speed: f32,
}

fn default_speed() -> f32 {
    1.0
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    // Args: <model_path> <voices_path> [port]. The Tauri backend supplies
    // the first two from its own bundled resource directory - see
    // kokoro_start's command construction in src-tauri/src/lib.rs. Not
    // using env vars for these two since externalBin's spawn API makes
    // passing plain args simpler than setting up a child process's
    // environment cross-platform.
    let model_path = args.get(1).cloned().unwrap_or_else(|| {
        eprintln!("kokoro-sidecar: missing required arg 1 (model .onnx path)");
        std::process::exit(1);
    });
    let voices_path = args.get(2).cloned().unwrap_or_else(|| {
        eprintln!("kokoro-sidecar: missing required arg 2 (voices path)");
        std::process::exit(1);
    });
    let port: u16 = args
        .get(3)
        .and_then(|p| p.parse().ok())
        .unwrap_or(5757);

    eprintln!("kokoro-sidecar: loading model from {model_path} (voices: {voices_path})...");
    let tts = match KokoroTts::new(&model_path, &voices_path).await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("kokoro-sidecar: FAILED to load model: {e:#}");
            std::process::exit(1);
        }
    };
    eprintln!("kokoro-sidecar: model loaded, listening on 127.0.0.1:{port}");

    let state = Arc::new(AppState { tts: Mutex::new(tts) });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/synthesize", post(synthesize))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            // Most likely cause: the port is already taken by a previous
            // instance of this same sidecar that didn't get cleaned up -
            // treated as non-fatal, since that instance is presumably
            // already serving requests fine. Exit 0, not an error state.
            eprintln!("kokoro-sidecar: could not bind 127.0.0.1:{port} ({e}) - likely already running, exiting quietly");
            std::process::exit(0);
        }
    };
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str {
    "ok"
}

async fn synthesize(
    State(state): State<Arc<AppState>>,
    Json(req): Json<SynthesizeRequest>,
) -> Response {
    if req.text.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: "text must not be empty".into() }),
        )
            .into_response();
    }

    let voice = Voice::new(&req.voice).with_speed(req.speed);

    // Kokoro's ONNX session isn't proven thread-safe for concurrent
    // synth() calls (nothing in its docs confirms it is), so requests are
    // serialized through this lock rather than risking a data race for
    // the sake of parallelism this single-streamer use case doesn't need
    // anyway - one Chat + TTS Overlay only ever wants one voice line
    // playing at a time regardless.
    let tts = state.tts.lock().await;
    let result = tts.synth(&req.text, voice).await;
    drop(tts);

    let (samples, _took) = match result {
        Ok(r) => r,
        Err(e) => {
            eprintln!("kokoro-sidecar: synth failed: {e:#}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse { error: format!("synthesis failed: {e}") }),
            )
                .into_response();
        }
    };

    match encode_wav(&samples) {
        Ok(bytes) => {
            let mut res = bytes.into_response();
            res.headers_mut()
                .insert("Content-Type", HeaderValue::from_static("audio/wav"));
            res
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse { error: format!("WAV encoding failed: {e}") }),
        )
            .into_response(),
    }
}

// kokoro-en returns raw f32 PCM samples at 24kHz mono with no encoding
// helper (confirmed against its published API - no `hound`/WAV dependency
// in its own dependency tree) - this is the minimal wrapper that makes
// them playable by a plain browser <audio> element via a Blob URL,
// exactly the same pattern chat-tts-engine.js's Polly path already uses.
fn encode_wav(samples: &[f32]) -> Result<Vec<u8>, hound::Error> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 24_000,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut cursor = std::io::Cursor::new(Vec::new());
    {
        let mut writer = hound::WavWriter::new(&mut cursor, spec)?;
        for &s in samples {
            writer.write_sample(s)?;
        }
        writer.finalize()?;
    }
    Ok(cursor.into_inner())
}
