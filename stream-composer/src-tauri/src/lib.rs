// ============================================================================
// Stream Composer — Rust backend
// ============================================================================
// Same small-explicit-commands pattern this project has used from the start
// (originally in the standalone Popup Slide Editor's app/src-tauri, now
// merged in here as of v1.0.0). This one adds a couple of binary-file
// commands on top of the original set, since the canvas needs to import
// arbitrary image files (logos, graphics) and copy them into a baked
// project's assets/ folder.
// ============================================================================

use base64::Engine;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::ShellExt;

/// Opens the "choose a folder" dialog. Used both for "open an existing
/// project" and "pick where to save a new project."
#[tauri::command]
fn pick_project_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|file_path| file_path.into_path().ok())
        .map(|path_buf| path_buf.to_string_lossy().to_string())
}

/// Opens a "choose an image file" dialog (filtered to common image
/// extensions) — used when adding an `image` item to the canvas.
#[tauri::command]
fn pick_image_file(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "svg"])
        .blocking_pick_file()
        .and_then(|file_path| file_path.into_path().ok())
        .map(|path_buf| path_buf.to_string_lossy().to_string())
}

/// Reads a text file (e.g. project.json) and returns its contents.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|err| format!("Couldn't read {}: {}", path, err))
}

/// Overwrites a text file with new contents — the real in-place save.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|err| format!("Couldn't write {}: {}", path, err))
}

/// Reads a binary file (an image) and returns it as base64 text, so the
/// frontend can turn it into a `data:` URL for display on the canvas
/// without needing a second round trip through a temp file.
#[tauri::command]
fn read_binary_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|err| format!("Couldn't read {}: {}", path, err))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Writes base64-encoded bytes out as a binary file — used when baking a
/// project, to copy each referenced image into the output's assets/
/// folder.
#[tauri::command]
fn write_binary_file(path: String, base64_data: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|err| format!("Bad base64 data for {}: {}", path, err))?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|err| format!("Couldn't create folder for {}: {}", path, err))?;
    }
    std::fs::write(&path, bytes).map_err(|err| format!("Couldn't write {}: {}", path, err))
}

/// Quick existence check (e.g. confirming a folder already has a
/// project.json before treating it as an existing project).
#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// Resolves a filename to a real path inside this app's own local-data
/// directory (creating that directory if needed) - used for small
/// app-level persisted files (e.g. the Asset Library) that aren't part
/// of any one project, so they don't belong in a project folder. Deliberately
/// generic rather than a dedicated "library" command - the frontend
/// still does its own read_text_file/write_text_file/file_exists calls
/// against the resolved path, same generic file-I/O commands every other
/// persisted file in this app already uses.
#[tauri::command]
fn resolve_app_data_path(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(filename).to_string_lossy().to_string())
}

/// The current track info from Windows' own OS-level "Now Playing" media
/// session (System Media Transport Controls - the same source that
/// populates the volume flyout's mini-player). One integration covers
/// ANY app that hooks into it - Spotify, a YouTube Music browser tab, the
/// Apple Music Windows app, whatever - instead of building a separate
/// OAuth/API-key integration per streaming service.
///
/// Deliberately does NOT use `GetCurrentSession()` - verified live
/// (2026-08-13) against Harvey's own real machine while he had Spotify
/// playing alongside a paused Opera GX tab: Windows' notion of "current"
/// is just a last-interacted-with heuristic, not tied to a specific app,
/// and Harvey correctly flagged that a browser tab (e.g. a Twitch stream
/// he's watching) actually PLAYING audio at the same time as Spotify
/// could easily become "current" instead. Real fix: enumerate every
/// active session via `GetSessions()`, prefer whichever is genuinely
/// `Playing` (not just whichever Windows calls current), and if an
/// `app_filter` substring is given, only consider sessions whose
/// `SourceAppUserModelId` contains it (e.g. "spotify") - so a stream
/// tab playing in the background can never get shown instead of the
/// music app actually being asked for.
///
/// Unlike everything above this comment, the BAKED scene.html running in
/// OBS's Browser Source has no Tauri bridge at all (same constraint every
/// other engine module already works around) and this data only exists
/// on the Windows side, so a plain Tauri command alone can't reach it.
/// Same fix as Kokoro/Chatterbox's local TTS sidecars: a tiny local HTTP
/// server (see now_playing_server_thread below), polled by the baked
/// script via plain `fetch()`, on port 5759 (5757/5758 already taken).
#[derive(serde::Serialize)]
struct NowPlayingInfo {
    title: String,
    artist: String,
    album: String,
    playing: bool,
    app_id: String,
}

#[derive(serde::Serialize)]
struct NowPlayingSession {
    app_id: String,
    title: String,
    playing: bool,
}

async fn now_playing_all_sessions() -> Result<Vec<(windows::Media::Control::GlobalSystemMediaTransportControlsSession, String, String, bool)>, String> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    // Two passes deliberately, not one: `IVectorView<...>` (what
    // GetSessions() returns) isn't Send, so it can't stay alive across an
    // `.await` inside a Tauri async command's future. Pass 1 is fully
    // synchronous - pull owned session handles (which ARE individually
    // Send, unlike the vector view itself) plus their sync-only
    // properties out, then let the vector view drop. Pass 2, over the now-
    // owned Vec, does the one async call (TryGetMediaPropertiesAsync)
    // that actually needs to await.
    let owned_sessions: Vec<_> = {
        let sessions = manager.GetSessions().map_err(|e| e.to_string())?;
        let mut collected = Vec::new();
        for session in &sessions {
            let app_id = session.SourceAppUserModelId().map(|h| h.to_string()).unwrap_or_default();
            let playing = session
                .GetPlaybackInfo()
                .ok()
                .and_then(|info| info.PlaybackStatus().ok())
                .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                .unwrap_or(false);
            collected.push((session.clone(), app_id, playing));
        }
        collected
    };

    let mut out = Vec::new();
    for (session, app_id, playing) in owned_sessions {
        let title = session
            .TryGetMediaPropertiesAsync()
            .map_err(|e| e.to_string())?
            .await
            .ok()
            .and_then(|p| p.Title().ok())
            .map(|h| h.to_string())
            .unwrap_or_default();
        out.push((session, app_id, title, playing));
    }
    Ok(out)
}

async fn now_playing_info_impl(app_filter: Option<&str>) -> Result<Option<NowPlayingInfo>, String> {
    let filter_lower = app_filter
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty());

    let sessions = now_playing_all_sessions().await?;

    // Prefer a session that's actually Playing over one that merely has
    // track info loaded (e.g. paused) - and if a filter is set, only
    // consider sessions matching it at all, playing or not, so pausing
    // Spotify shows "nothing" rather than falling through to whatever
    // else happens to be playing.
    let candidates: Vec<_> = sessions
        .iter()
        .filter(|(_, app_id, _, _)| {
            filter_lower.as_ref().is_none_or(|f| app_id.to_lowercase().contains(f))
        })
        .collect();

    let chosen = candidates
        .iter()
        .find(|(_, _, _, playing)| *playing)
        .or_else(|| candidates.first());

    let Some((session, app_id, _title, _playing)) = chosen else {
        return Ok(None);
    };

    let props = session
        .TryGetMediaPropertiesAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    let title = props.Title().map(|h| h.to_string()).unwrap_or_default();
    let artist = props.Artist().map(|h| h.to_string()).unwrap_or_default();
    let album = props.AlbumTitle().map(|h| h.to_string()).unwrap_or_default();

    if title.is_empty() && artist.is_empty() {
        return Ok(None);
    }

    Ok(Some(NowPlayingInfo {
        title,
        artist,
        album,
        playing: session
            .GetPlaybackInfo()
            .ok()
            .and_then(|info| info.PlaybackStatus().ok())
            .map(|status| status == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
            .unwrap_or(false),
        app_id: app_id.clone(),
    }))
}

#[tauri::command]
async fn now_playing_info(app_filter: Option<String>) -> Result<Option<NowPlayingInfo>, String> {
    now_playing_info_impl(app_filter.as_deref()).await
}

/// Lists every currently active media session Windows knows about, so the
/// Properties panel can show Harvey (or anyone) a live "here's what's
/// actually running right now" list instead of guessing at an app-name
/// filter string blind.
#[tauri::command]
async fn now_playing_sessions() -> Result<Vec<NowPlayingSession>, String> {
    let sessions = now_playing_all_sessions().await?;
    Ok(sessions
        .into_iter()
        .map(|(_, app_id, title, playing)| NowPlayingSession { app_id, title, playing })
        .collect())
}

const NOW_PLAYING_SERVER_PORT: u16 = 5759;

/// Runs forever on its own OS thread, started once at app launch (no
/// explicit Start/Stop step needed, unlike Kokoro/Chatterbox - this has
/// no model to download and costs nothing to just always be available).
/// Every request gets a fresh read plus a permissive CORS header, since
/// the baked scene.html's origin (a local file opened by OBS's Browser
/// Source) isn't the same as 127.0.0.1:5759 and the browser will block
/// the fetch without it. An optional `?app=<substring>` query param on
/// the request URL is forwarded as the app_filter (case-insensitive
/// substring match against each session's SourceAppUserModelId) - baked
/// into the request URL at bake time from the item's own "App to show"
/// property, not something OBS/the user has to configure separately.
fn now_playing_server_thread() {
    std::thread::spawn(|| {
        let server = match tiny_http::Server::http(("127.0.0.1", NOW_PLAYING_SERVER_PORT)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("now-playing server: could not bind 127.0.0.1:{NOW_PLAYING_SERVER_PORT}: {e}");
                return;
            }
        };
        for request in server.incoming_requests() {
            let app_filter = request
                .url()
                .split_once('?')
                .and_then(|(_, query)| query.split('&').find_map(|pair| pair.strip_prefix("app=")))
                .map(|v| {
                    percent_decode(v)
                });

            let body = match tauri::async_runtime::block_on(now_playing_info_impl(app_filter.as_deref())) {
                Ok(info) => serde_json::to_string(&info).unwrap_or_else(|_| "null".to_string()),
                Err(e) => format!("{{\"error\":{}}}", serde_json::to_string(&e).unwrap_or_default()),
            };
            let response = tiny_http::Response::from_string(body)
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                .with_header(tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
            let _ = request.respond(response);
        }
    });
}

/// Minimal percent-decoding for the one query param we read (`app=`) -
/// avoids pulling in a full URL-parsing crate just for this.
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(b' ');
        } else {
            out.push(bytes[i]);
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// OBS WebSocket automation (task #47) - lets the editor push a baked
/// scene straight into a running OBS instance as a Browser Source,
/// instead of the user copying the file path into OBS by hand every
/// time. Design confirmed with Harvey 2026-08-13 (AskUserQuestion):
/// user-triggered via a "Push to OBS" button (never automatic on every
/// bake - an OBS connection issue should never interrupt the normal
/// save/bake flow), auto-creates the Browser Source in whichever scene
/// the user picks if none exists yet for this project, updates it in
/// place on every push after that.
///
/// Built on `obws` 0.15.0 - real API confirmed by reading its actual
/// source (not guessed): `Client::connect`, `inputs().list/create/
/// set_settings`, and a purpose-built `BrowserSource` settings struct
/// with exactly the fields OBS's browser_source input kind expects
/// (`is_local_file`/`local_file`/`url`/`width`/`height`/etc.) - no need
/// to hand-construct that JSON shape ourselves.
///
/// Known, documented limitation (Harvey explicitly OK'd shipping with
/// this rather than waiting): obs-websocket has no dedicated "force
/// hard refresh" call for a Browser Source - only a settings/URL
/// update, which OBS *usually* reloads on its own but isn't a hard
/// guarantee the way a browser's Ctrl+F5 is.
#[tauri::command]
async fn obs_list_scenes(host: String, port: u16, password: Option<String>) -> Result<Vec<String>, String> {
    let client = obws::Client::connect(host, port, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    let scenes = client.scenes().list().await.map_err(|e| e.to_string())?;
    Ok(scenes.scenes.into_iter().map(|s| s.id.name).collect())
}

#[tauri::command]
async fn obs_push_scene(
    host: String,
    port: u16,
    password: Option<String>,
    scene_name: String,
    source_name: String,
    file_path: String,
    width: u32,
    height: u32,
) -> Result<String, String> {
    use obws::requests::custom::source_settings::{BrowserSource, SOURCE_BROWSER_SOURCE};
    use obws::requests::inputs::{Create, SetSettings};

    let client = obws::Client::connect(host, port, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;

    // Input names are globally unique in OBS (not scoped per-scene), so
    // a plain name match against every browser_source input tells us
    // whether this project already has one, regardless of which scene
    // it currently lives in.
    let existing = client
        .inputs()
        .list(Some(SOURCE_BROWSER_SOURCE))
        .await
        .map_err(|e| e.to_string())?;
    let already_exists = existing.iter().any(|i| i.id.name == source_name);

    let path = std::path::Path::new(&file_path);
    let settings = BrowserSource {
        is_local_file: true,
        local_file: path,
        url: "",
        width,
        height,
        restart_when_active: true,
        ..Default::default()
    };

    if already_exists {
        client
            .inputs()
            .set_settings(SetSettings {
                input: source_name.as_str().into(),
                settings: &settings,
                overlay: Some(true),
            })
            .await
            .map_err(|e| e.to_string())?;
        Ok("updated".to_string())
    } else {
        client
            .inputs()
            .create(Create {
                scene: scene_name.as_str().into(),
                input: &source_name,
                kind: SOURCE_BROWSER_SOURCE,
                settings: Some(settings),
                enabled: Some(true),
            })
            .await
            .map_err(|e| e.to_string())?;
        Ok("created".to_string())
    }
}

// ============================================================================
// OBS LIVE VOLUME METER RELAY (PNGTuber "react to an OBS input" mode) -
// v1's PNGTuber talking-animation only reacts to the browser's own
// getUserMedia mic capture, baked as a static threshold at bake time. This
// lets it react to a live OBS audio input's volume instead (mic, Discord
// audio, game audio - whatever the user routes into OBS) so the sensitivity
// slider takes effect live in OBS without re-baking/re-pushing.
//
// Two independent pieces, deliberately not sharing a connection:
//
// 1. obs_list_inputs - a one-shot connect/list/disconnect, same shape as
//    obs_list_scenes above, just for populating an "OBS Input" picker.
//    Filtered to audio-capturing kinds.
//
// 2. A persistent relay + its own tiny_http sidecar on port 5760
//    (5757-5759 already taken - see Kokoro/Chatterbox/Now Playing above),
//    polled by the BAKED scene.html running in OBS's Browser Source, same
//    way Now Playing is. Unlike Now Playing (a free local OS read, started
//    unconditionally at launch), this opens a real network connection to a
//    possibly-absent OBS instance - so the connection itself is lazy,
//    started on whichever request happens to hit this sidecar first, via
//    OBS_VOLUME_RELAY.get_or_init() below (OnceLock, so "first request" is
//    naturally exactly-once even under concurrent requests). The
//    tiny_http listener itself still starts eagerly in .setup(), same as
//    Now Playing - it's free to just be listening.
//
// obws 0.15.0's event support (subscribing to InputVolumeMeters - the one
// non-default/high-volume event category this app has ever needed) is
// gated behind its own "events" Cargo feature (off by default - see
// obws's own Cargo.toml) - confirmed by reading obws's actual source
// (registry cache: obws-0.15.0/src/{client/mod.rs,events.rs,requests/mod.rs}),
// not guessed:
//   - `Client::connect_with_config(ConnectConfig { event_subscriptions:
//     Some(EventSubscription::INPUT_VOLUME_METERS), .. })` opts into the
//     high-volume InputVolumeMeters category specifically -
//     `EventSubscription::ALL` (what a plain `Client::connect` effectively
//     asks for) deliberately EXCLUDES every high-volume event, InputVolumeMeters
//     included (see the `ALL` vs `INPUT_VOLUME_METERS` bitflag constants in
//     requests/mod.rs) - so a one-shot `connect()` would never see this event.
//   - `Client::events() -> Result<EventStream>` (client/mod.rs) hands back a
//     broadcast-channel-backed stream (events.rs) that implements
//     `futures_util::Stream` - consumed here with `StreamExt::next()`.
//   - `Event::InputVolumeMeters { inputs: Vec<InputVolumeMeter> }` where
//     `InputVolumeMeter` is `{ name: String, levels: Vec<[f32; 3]> }` - one
//     `[f32; 3]` per audio channel, "in **Mul**" per obws's own doc comment
//     on the field (i.e. a linear multiplier, NOT dB).
// ============================================================================

#[derive(serde::Serialize)]
struct InputSummary {
    name: String,
    kind: String,
}

/// One-shot connect/list/disconnect - NOT tied to the persistent relay
/// below, same independent-connection-lifecycle pattern as obs_list_scenes.
/// obws has no generic "is this kind audio-capable" helper - kind ids are
/// raw OBS plugin identifiers and are platform-specific (Windows:
/// `wasapi_input_capture` / `wasapi_output_capture` /
/// `wasapi_process_output_capture`; macOS: `coreaudio_input_capture` /
/// `coreaudio_output_capture` - the only ones obws itself even names a
/// constant for, see requests::custom::source_settings; Linux similarly
/// `pulse_*`/`jack_*` etc.) - there is no flat `audio_input_capture` kind id
/// on any platform, so matched generically by suffix against
/// `unversioned_kind` (stable across OBS plugin version bumps) instead of
/// hardcoding one platform's ids.
#[tauri::command]
async fn obs_list_inputs(host: String, port: u16, password: Option<String>) -> Result<Vec<InputSummary>, String> {
    let client = obws::Client::connect(host, port, password.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    let inputs = client.inputs().list(None).await.map_err(|e| e.to_string())?;
    Ok(inputs
        .into_iter()
        .filter(|i| {
            i.unversioned_kind.ends_with("_input_capture") || i.unversioned_kind.ends_with("_output_capture")
        })
        .map(|i| InputSummary { name: i.id.name, kind: i.unversioned_kind })
        .collect())
}

/// App-level OBS connection settings (host/port/password) - read from the
/// SAME obs-settings.json Push to OBS already persists (main.js's
/// loadObsSettings/saveObsSettings, via resolve_app_data_path) rather than
/// a second settings surface for this feature.
#[derive(serde::Deserialize)]
struct ObsSettingsFile {
    host: String,
    port: u16,
    password: Option<String>,
}

/// Latest known volume level per OBS input name, plus whether the relay is
/// currently connected to OBS - shared between the background relay task
/// and every sidecar request. `levels` holds the raw "Mul" value straight
/// off the wire (see the module header above) - deliberately not
/// normalized/converted here, that's the baked script's job.
#[derive(Default)]
struct ObsVolumeRelayState {
    levels: Mutex<HashMap<String, f64>>,
    connected: AtomicBool,
}

/// Started at most once per app run, on whichever request happens to be
/// first - `OnceLock::get_or_init` is itself the exactly-once guarantee, no
/// separate "already started" flag needed.
static OBS_VOLUME_RELAY: OnceLock<Arc<ObsVolumeRelayState>> = OnceLock::new();

fn obs_volume_relay_state(app: &tauri::AppHandle) -> Arc<ObsVolumeRelayState> {
    Arc::clone(OBS_VOLUME_RELAY.get_or_init(|| {
        let state = Arc::new(ObsVolumeRelayState::default());
        spawn_obs_volume_relay(app.clone(), Arc::clone(&state));
        state
    }))
}

/// Runs for the rest of the app's lifetime once started. Reconnects with an
/// exponential backoff (1s, 2s, 4s, 8s, capped at 10s) whenever
/// obs-settings.json is missing/unreadable, OBS isn't running, or an
/// already-open connection drops - never hammers a possibly-absent OBS
/// instance. Backoff resets to 1s after every successful connect.
fn spawn_obs_volume_relay(app: tauri::AppHandle, state: Arc<ObsVolumeRelayState>) {
    tauri::async_runtime::spawn(async move {
        use futures_util::StreamExt;

        let base_backoff = std::time::Duration::from_secs(1);
        let max_backoff = std::time::Duration::from_secs(10);
        let mut backoff = base_backoff;

        loop {
            let settings = resolve_app_data_path(app.clone(), "obs-settings.json".to_string())
                .ok()
                .and_then(|path| std::fs::read_to_string(path).ok())
                .and_then(|text| serde_json::from_str::<ObsSettingsFile>(&text).ok());

            let Some(settings) = settings else {
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(max_backoff);
                continue;
            };

            let connect_result = obws::Client::connect_with_config(obws::client::ConnectConfig {
                host: settings.host.as_str(),
                port: settings.port,
                password: settings.password.as_deref(),
                event_subscriptions: Some(obws::requests::EventSubscription::INPUT_VOLUME_METERS),
                broadcast_capacity: obws::client::DEFAULT_BROADCAST_CAPACITY,
                connect_timeout: obws::client::DEFAULT_CONNECT_TIMEOUT,
                dangerous: None,
            })
            .await
            .and_then(|client| client.events().map(|events| (client, events)));

            // `_client` stays bound (not dropped) for as long as we're reading
            // events - obws's `Client` disconnects on Drop, which would kill the
            // event stream out from under the while-let below.
            let (_client, mut events) = match connect_result {
                Ok(pair) => pair,
                Err(e) => {
                    eprintln!("obs-volume-relay: could not connect/subscribe: {e}");
                    tokio::time::sleep(backoff).await;
                    backoff = (backoff * 2).min(max_backoff);
                    continue;
                }
            };

            state.connected.store(true, Ordering::Relaxed);
            backoff = base_backoff;

            while let Some(event) = events.next().await {
                if let obws::events::Event::InputVolumeMeters { inputs } = event {
                    let mut levels = state.levels.lock().unwrap();
                    for input in inputs {
                        // Each channel is [magnitude*volume, peak*volume, peak] (per
                        // obs-websocket's own volume-meter source) - index 1 (post-volume
                        // peak) is the closest match to "how loud is this input right now
                        // through this app's set volume", maxed across channels so a
                        // stereo/multi-channel input doesn't pick one arbitrary channel.
                        // Still the raw Mul value, unconverted either way.
                        let level = input
                            .levels
                            .iter()
                            .map(|channel| channel[1] as f64)
                            .fold(0.0_f64, f64::max);
                        levels.insert(input.name, level);
                    }
                }
            }

            // The stream ended - the connection dropped (OBS closed, network
            // blip, etc). Reflect that immediately rather than serving stale
            // "connected" state, then fall through to reconnect.
            state.connected.store(false, Ordering::Relaxed);
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(max_backoff);
        }
    });
}

const OBS_VOLUME_METER_SERVER_PORT: u16 = 5760;

/// Tracks the currently-open project's project.json path, mirrored from the
/// JS side (main.js's `projectFolder`) via set_current_project_path below.
/// Deliberately NOT trusted from the HTTP request's own query string -
/// obs_volume_meter_server_thread has no auth and `Access-Control-Allow-
/// Origin: *`, so ANY local page open in the user's browser while this app
/// is running could otherwise ask it to open and parse an arbitrary path on
/// disk. Storing "which project is open" as app state the frontend keeps in
/// sync, instead, closes that off entirely - the relay only ever reads
/// whatever project THIS app actually has open.
static CURRENT_PROJECT_PATH: Mutex<Option<String>> = Mutex::new(None);

/// Called by main.js every time it sets its own `projectFolder` (creating,
/// opening, or importing into a project) so this app's state always mirrors
/// the frontend's idea of "which project is open" - see CURRENT_PROJECT_PATH
/// above for why the relay needs this instead of a client-supplied path.
/// `path: None` clears it back to "no project open" (there's currently no
/// UI path that does this - projectFolder only ever goes from unset to set -
/// but the command supports it for whenever that changes).
#[tauri::command]
fn set_current_project_path(path: Option<String>) {
    *CURRENT_PROJECT_PATH.lock().unwrap() = path;
}

#[derive(serde::Serialize)]
struct ObsVolumeMeterResponse {
    level: f64,
    #[serde(rename = "inputFound")]
    input_found: bool,
    #[serde(rename = "obsConnected")]
    obs_connected: bool,
    // Live sensitivity settings, re-read from the current project file on
    // every poll alongside obsInputName (see find_obs_item_settings below) -
    // populated whenever the live lookup succeeds so the baked script can
    // pick up a changed sensitivity slider without a re-bake. Falls back to
    // the bake-time query-param values (already threaded through by the
    // caller) when the live lookup fails for any reason, same discipline as
    // obsInputName always had.
    #[serde(rename = "micThreshold")]
    mic_threshold: f64,
    #[serde(rename = "holdMs")]
    hold_ms: u64,
}

/// Minimal `?key=value&key2=value2` parser, reusing percent_decode below
/// for both keys and values - generalized from now_playing_server_thread's
/// single-param `app=` parsing above, since this route needs several.
fn parse_query_params(url: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    if let Some((_, query)) = url.split_once('?') {
        for pair in query.split('&') {
            if pair.is_empty() {
                continue;
            }
            match pair.split_once('=') {
                Some((k, v)) => {
                    params.insert(percent_decode(k), percent_decode(v));
                }
                None => {
                    params.insert(percent_decode(pair), String::new());
                }
            }
        }
    }
    params
}

/// A pngtuber item's live-relevant OBS settings, as found in the project
/// file right now. Any field that couldn't be read (missing/absent prop,
/// wrong type) is `None` - the caller falls back to that ONE field's
/// bake-time query-param value rather than discarding the whole lookup,
/// matching find_obs_item_settings's existing "degrade, don't break" rule.
struct ObsItemSettings {
    obs_input_name: Option<String>,
    mic_threshold: Option<f64>,
    hold_ms: Option<u64>,
}

/// Reads the project file fresh on every request (cheap - these are small
/// JSON files) and looks up the given item's live `obsInputName`,
/// `micThreshold`, and `holdMs` props - the three settings a streamer can
/// change from the properties panel without wanting to re-bake. Project
/// schema confirmed from main.js (newProjectData/addItem/saveProject): a
/// project is `{ canvasWidth, canvasHeight, items: [...] }`, each item is
/// `{ id, type, x, y, width, height, rotation, zIndex, props: {...} }` with
/// per-type properties living under `props`, not flattened onto the item
/// itself. Parsed as a loose `serde_json::Value` rather than a strict
/// struct - deliberately tolerant of every other item type/prop shape in
/// the same file, which this code has no need to understand.
///
/// Matched against `item_id` - the item's RAW `id` field (main.js's
/// `uid()`, e.g. "item-a1b2c3d4") - NOT the sanitized/index-suffixed DOM
/// `instanceId` bake.js also generates (e.g. "pngtuber-itema1b2c3d4-0").
/// Those two strings can never be equal (one strips characters and appends
/// an index, the other doesn't), so matching against instanceId here would
/// make this lookup always fail silently - see bake.js/pngtuber-engine.js
/// for the itemId param this is paired with.
///
/// Returns `None` (letting the caller fall back entirely to the baked
/// query params) if the project file itself can't be read/parsed/matched.
/// A missing/stale project file on disk should never break the live meter,
/// only degrade it.
fn find_obs_item_settings(project_file_path: &str, item_id: &str) -> Option<ObsItemSettings> {
    let text = std::fs::read_to_string(project_file_path).ok()?;
    let project: serde_json::Value = serde_json::from_str(&text).ok()?;
    let item = project
        .get("items")?
        .as_array()?
        .iter()
        .find(|item| item.get("id").and_then(|v| v.as_str()) == Some(item_id))?;
    let props = item.get("props")?;

    let obs_input_name = props
        .get("obsInputName")
        .and_then(|v| v.as_str())
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string());
    let mic_threshold = props.get("micThreshold").and_then(|v| v.as_f64());
    let hold_ms = props.get("holdMs").and_then(|v| v.as_u64());

    Some(ObsItemSettings { obs_input_name, mic_threshold, hold_ms })
}

/// Sidecar for the baked PNGTuber engine to poll a live OBS input's volume
/// - see the module header above for why this exists and why the actual
/// OBS connection (spawn_obs_volume_relay) is lazy while this HTTP
/// listener itself starts eagerly in .setup(), same as Now Playing.
fn obs_volume_meter_server_thread(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let server = match tiny_http::Server::http(("127.0.0.1", OBS_VOLUME_METER_SERVER_PORT)) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("obs-volume-meter server: could not bind 127.0.0.1:{OBS_VOLUME_METER_SERVER_PORT}: {e}");
                return;
            }
        };
        for request in server.incoming_requests() {
            let params = parse_query_params(request.url());
            let state = obs_volume_relay_state(&app);

            // The project file path is NEVER trusted from the client - see
            // CURRENT_PROJECT_PATH's doc comment. `itemId` (the item's raw,
            // unsanitized id) is the only thing the client supplies to
            // locate the item within that project.
            let live_settings = match (
                CURRENT_PROJECT_PATH.lock().unwrap().clone(),
                params.get("itemId"),
            ) {
                (Some(path), Some(id)) => find_obs_item_settings(&path, id),
                _ => None,
            };

            let input_name = live_settings
                .as_ref()
                .and_then(|s| s.obs_input_name.clone())
                .or_else(|| params.get("obsInputName").cloned());

            let mic_threshold = live_settings
                .as_ref()
                .and_then(|s| s.mic_threshold)
                .or_else(|| params.get("micThreshold").and_then(|v| v.parse::<f64>().ok()))
                .unwrap_or(15.0);

            let hold_ms = live_settings
                .as_ref()
                .and_then(|s| s.hold_ms)
                .or_else(|| params.get("holdMs").and_then(|v| v.parse::<u64>().ok()))
                .unwrap_or(200);

            let (level, input_found) = match &input_name {
                Some(name) => {
                    let levels = state.levels.lock().unwrap();
                    match levels.get(name) {
                        Some(v) => (*v, true),
                        None => (0.0, false),
                    }
                }
                None => (0.0, false),
            };

            let body_struct = ObsVolumeMeterResponse {
                level,
                mic_threshold,
                hold_ms,
                input_found,
                obs_connected: state.connected.load(Ordering::Relaxed),
            };
            let body = serde_json::to_string(&body_struct).unwrap_or_else(|_| "null".to_string());
            let response = tiny_http::Response::from_string(body)
                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                .with_header(tiny_http::Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
            let _ = request.respond(response);
        }
    });
}

/// Opens a URL with whatever the operating system's default browser is.
/// Used for single-item live preview (e.g. previewing a popup-slide item
/// without doing a full Bake first): a temp scene.html is written, then
/// opened here. Ported from the standalone Popup Slide Editor's
/// preview_overlay command, unchanged.
///
/// Expects a full `file://...` URL with a cache-busting `?t=...` on the
/// end, so a browser that already has a stale preview tab open is forced
/// to load fresh instead of just re-focusing that old tab.
#[tauri::command]
fn preview_overlay(app: tauri::AppHandle, url: String) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|err| err.to_string())
}

/// Copies plain text to the system clipboard — used for the "Copy OBS
/// setup instructions" button. Goes through the clipboard-manager plugin
/// rather than the frontend's raw `navigator.clipboard`, which isn't
/// reliably permitted inside a WebView2 Tauri window.
#[tauri::command]
fn copy_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|err| err.to_string())
}

// ============================================================================
// KOKORO LOCAL TTS (task #36) — unlike every other command in this file,
// the actual TTS PLAYBACK never goes through these commands at all: it
// happens inside the BAKED overlay (scene.html, running in OBS's Browser
// Source), which has no Tauri bridge and talks to the sidecar over plain
// HTTP, exactly like the Polly connector talks to AWS (see
// chat-tts-engine.js). These commands only handle what genuinely needs
// native/filesystem access: getting the (large) model files onto disk,
// and starting the sidecar process.
//
// The sidecar is spawned DETACHED from this app's lifetime on purpose —
// see kokoro-sidecar/src/main.rs's header comment. It is NOT killed when
// Stream Composer Suite exits: a streamer's OBS session routinely
// outlives the editor by hours, and TTS needs to keep working the whole
// time. This mirrors an operational reality streamers already live with
// (OBS itself has to stay running) rather than inventing a new one — but
// it does mean a stray kokoro-sidecar.exe can be left running after
// closing the app, which is why the properties panel (main.js) has an
// explicit Stop control, not just Start.
// ============================================================================

const KOKORO_PORT: u16 = 5757;
const KOKORO_MODEL_URL: &str = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx";
const KOKORO_VOICES_BASE_URL: &str = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

// English-language voices only for now (American + British) — Kokoro's
// other 6 languages are real but out of scope until this app has any
// non-English-focused feature to pair them with. Keeps the download to
// ~15MB (29 voices x ~510KB) instead of ~28MB for all 54.
const KOKORO_VOICES: &[&str] = &[
    "af", "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
    "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
    "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx",
    "am_puck", "am_santa",
    "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
];

fn kokoro_model_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("kokoro-models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dir.join("voices")).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Whether the model + all English voice files are already downloaded —
/// checked before showing "Download" vs. "Start" in the properties panel.
#[tauri::command]
fn kokoro_model_status(app: tauri::AppHandle) -> Result<bool, String> {
    let dir = kokoro_model_dir(&app)?;
    if !dir.join("model_quantized.onnx").is_file() {
        return Ok(false);
    }
    for voice in KOKORO_VOICES {
        if !dir.join("voices").join(format!("{voice}.bin")).is_file() {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Downloads the Kokoro model (~92MB) + all bundled English voices
/// (~15MB) to this machine's local app-data directory. Deliberately NOT
/// bundled in the installer itself — most users will never touch this
/// feature, and adding 92MB+ to every install regardless wasn't a
/// tradeoff worth making for them. Emits `kokoro-download-progress`
/// events (`{file, index, total}`) so the properties panel can show real
/// progress instead of a spinner with no feedback for what's a genuinely
/// slow, multi-minute download on an average connection.
#[tauri::command]
async fn kokoro_download_model(app: tauri::AppHandle) -> Result<(), String> {
    let dir = kokoro_model_dir(&app)?;

    let mut files: Vec<(String, std::path::PathBuf)> =
        vec![(KOKORO_MODEL_URL.to_string(), dir.join("model_quantized.onnx"))];
    for voice in KOKORO_VOICES {
        files.push((
            format!("{KOKORO_VOICES_BASE_URL}/{voice}.bin"),
            dir.join("voices").join(format!("{voice}.bin")),
        ));
    }

    let total = files.len();
    for (index, (url, dest)) in files.into_iter().enumerate() {
        let filename = dest
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_default();

        if dest.is_file() {
            // Re-running this after a previous partial download doesn't
            // re-fetch files that already completed — not byte-range
            // resume within a single file, just skip-if-complete at the
            // file level, which is enough given most of these are small
            // voice files plus one larger model file.
            let _ = app.emit(
                "kokoro-download-progress",
                serde_json::json!({ "index": index, "total": total, "file": filename }),
            );
            continue;
        }

        let app2 = app.clone();
        let dest2 = dest.clone();
        let filename2 = filename.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let response = reqwest::blocking::get(&url).map_err(|e| e.to_string())?;
            if !response.status().is_success() {
                return Err(format!("download failed for {url}: HTTP {}", response.status()));
            }
            let bytes = response.bytes().map_err(|e| e.to_string())?;
            std::fs::write(&dest2, &bytes).map_err(|e| e.to_string())?;
            let _ = app2.emit(
                "kokoro-download-progress",
                serde_json::json!({ "index": index, "total": total, "file": filename2 }),
            );
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
    }

    Ok(())
}

/// Spawns the Kokoro sidecar as a DETACHED process (see this section's
/// header comment for why) listening on 127.0.0.1:5757. Safe to call
/// again if it's already running — the sidecar itself exits quietly on a
/// port-bind conflict rather than erroring (kokoro-sidecar/src/main.rs).
#[tauri::command]
async fn kokoro_start(app: tauri::AppHandle) -> Result<u16, String> {
    let dir = kokoro_model_dir(&app)?;
    let model_path = dir.join("model_quantized.onnx");
    let voices_path = dir.join("voices");
    if !model_path.is_file() {
        return Err("Kokoro model isn't downloaded yet".into());
    }

    let sidecar = app.shell().sidecar("kokoro-sidecar").map_err(|e| e.to_string())?;
    let (mut rx, _child) = sidecar
        .args([
            model_path.to_string_lossy().to_string(),
            voices_path.to_string_lossy().to_string(),
            KOKORO_PORT.to_string(),
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    // _child is deliberately dropped (not held/killed) here — the process
    // must not be tied to this command's lifetime, see the header comment.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let tauri_plugin_shell::process::CommandEvent::Stderr(line) = event {
                eprintln!("[kokoro-sidecar] {}", String::from_utf8_lossy(&line));
            }
        }
    });

    Ok(KOKORO_PORT)
}

/// Best-effort stop for the properties panel's Stop control — finds any
/// running kokoro-sidecar.exe process and kills it. Not scoped to a PID
/// this app itself tracks (the detached-spawn design means we don't hold
/// one), so this is intentionally a blunt "kill anything with this name,"
/// same as what a user closing it via Task Manager would do.
#[tauri::command]
fn kokoro_stop() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("taskkill")
            .args(["/IM", "kokoro-sidecar.exe", "/F"])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ============================================================================
// CHATTERBOX LOCAL TTS (task #44, v1.9.0-b) — a fourth Chat + TTS Overlay
// voice provider, alongside Kokoro. Same local-HTTP-server contract as
// kokoro-sidecar (GET /health, POST /synthesize), running on port 5758
// (Kokoro uses 5757) so both can run at once for direct comparison.
//
// WHY PYTHON, NOT A TAURI externalBin SIDECAR LIKE KOKORO: Chatterbox has
// no ONNX export and no Rust crate - real feasibility-checked before
// building this (2026-08-11): pip install works, real CPU synthesis
// produces genuine audio. The real cost is size: PyTorch + this
// package's dependency tree is ~1-3GB, versus Kokoro's ~66MB binary.
// Harvey explicitly approved this tradeoff ("build it anyway, opt-in
// heavy download, same pattern as Kokoro's model").
//
// Unlike Kokoro's binary (which MUST be bundled for externalBin to find
// it at build time), NONE of this needs to be bundled in the installer -
// the portable Python interpreter, all pip packages, and the model
// weights are ALL downloaded on demand into the app's local-data
// directory. Only the tiny sidecar.py script itself
// (`resources/chatterbox_sidecar.py`, a few KB) is bundled, via Tauri's
// plain `resources` mechanism (not externalBin - this isn't a prebuilt
// binary, just a text file the app writes into place at runtime).
//
// Spawned via plain `std::process::Command`, not tauri-plugin-shell's
// sidecar API - that mechanism is specifically for registered
// externalBin binaries; the portable Python interpreter lives in
// app-local-data instead, so there's nothing to "register" ahead of
// time. Same DETACHED lifecycle reasoning as Kokoro either way - see
// that section's header comment above.
// ============================================================================

const CHATTERBOX_PORT: u16 = 5758;
const CHATTERBOX_PYTHON_URL: &str = "https://github.com/astral-sh/python-build-standalone/releases/download/20260807/cpython-3.12.13%2B20260807-x86_64-pc-windows-msvc-install_only.tar.gz";

fn chatterbox_env_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("chatterbox-env");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn chatterbox_python_exe(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(chatterbox_env_dir(app)?.join("python").join("python.exe"))
}

/// Whether the portable Python + chatterbox-tts + model weights are all
/// already downloaded and installed - checked via a marker file written
/// only after every step of `chatterbox_download_model` succeeds, not by
/// re-verifying every package on every check.
#[tauri::command]
fn chatterbox_model_status(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(chatterbox_env_dir(&app)?.join(".installed").is_file())
}

/// Downloads a portable Python 3.12 interpreter (~46MB), pip-installs
/// chatterbox-tts (~1-3GB - PyTorch and its own dependency tree, the
/// real cost of this provider), then pre-downloads the model weights so
/// the first real chat message doesn't eat that delay live. Emits
/// `chatterbox-download-progress` events with a `{stage}` string so the
/// properties panel can show which of the (few, coarse-grained - pip
/// doesn't expose clean percentage progress) steps is running, rather
/// than a spinner with zero feedback for what's a genuinely slow,
/// multi-minute download.
#[tauri::command]
async fn chatterbox_download_model(app: tauri::AppHandle) -> Result<(), String> {
    let dir = chatterbox_env_dir(&app)?;
    let python_exe = chatterbox_python_exe(&app)?;

    if !python_exe.is_file() {
        let _ = app.emit("chatterbox-download-progress", serde_json::json!({ "stage": "Downloading Python runtime" }));
        let archive_path = dir.join("python-portable.tar.gz");
        let url = CHATTERBOX_PYTHON_URL.to_string();
        let archive_path2 = archive_path.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let response = reqwest::blocking::get(&url).map_err(|e| e.to_string())?;
            if !response.status().is_success() {
                return Err(format!("Python download failed: HTTP {}", response.status()));
            }
            let bytes = response.bytes().map_err(|e| e.to_string())?;
            std::fs::write(&archive_path2, &bytes).map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;

        // Extracted with the flate2/tar CRATES, not a shelled-out `tar`
        // executable - a real bug caught in Harvey's own testing (2026-08-12,
        // task #55): `Command::new("tar")` failed with the exact Windows
        // "file not found" error Rust's std::io::Error produces when the
        // PROGRAM ITSELF can't be located to spawn (not a missing file
        // argument, despite how that message reads at a glance) - `tar`
        // wasn't reliably resolvable from this app's spawned-process PATH
        // on his machine. A pure-Rust extraction has no such dependency at
        // all, so this can't recur the same way.
        //
        // Deliberately NOT stripping the archive's leading "python/" path
        // component (unlike the old `--strip-components=1` tar command) -
        // verified directly against the real downloaded archive
        // (2026-08-13) that its actual layout is `python/python.exe`, so
        // extracting as-is into `dir` naturally produces `dir/python/
        // python.exe` - exactly what chatterbox_python_exe() below already
        // expects. The old stripped version would have landed python.exe
        // at `dir/python.exe` instead, a SECOND real bug that was simply
        // never reached because the `tar`-not-found error always failed
        // first - caught by checking the real archive, not assumed fixed.
        let _ = app.emit("chatterbox-download-progress", serde_json::json!({ "stage": "Extracting Python runtime" }));
        let dir2 = dir.clone();
        let archive_path2 = archive_path.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
            let file = std::fs::File::open(&archive_path2).map_err(|e| e.to_string())?;
            let gz = flate2::read::GzDecoder::new(file);
            let mut archive = tar::Archive::new(gz);
            archive.unpack(&dir2).map_err(|e| e.to_string())?;
            Ok(())
        })
        .await
        .map_err(|e| e.to_string())??;
        let _ = std::fs::remove_file(&archive_path);
    }

    let _ = app.emit("chatterbox-download-progress", serde_json::json!({ "stage": "Installing chatterbox-tts (this is the big one - several minutes, ~1-3GB)" }));
    let python_exe2 = python_exe.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let status = std::process::Command::new(&python_exe2)
            .args(["-m", "pip", "install", "--no-warn-script-location", "chatterbox-tts", "setuptools<81"])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("pip install chatterbox-tts failed".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = app.emit("chatterbox-download-progress", serde_json::json!({ "stage": "Downloading voice model weights" }));
    let python_exe3 = python_exe.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let status = std::process::Command::new(&python_exe3)
            .args(["-c", "from chatterbox.tts import ChatterboxTTS; ChatterboxTTS.from_pretrained(device='cpu')"])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Model weight download failed".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    std::fs::write(dir.join(".installed"), b"ok").map_err(|e| e.to_string())?;
    let _ = app.emit("chatterbox-download-progress", serde_json::json!({ "stage": "Done" }));
    Ok(())
}

/// Spawns the Chatterbox sidecar as a DETACHED process (see this
/// section's header comment) listening on 127.0.0.1:5758. Copies the
/// bundled `resources/chatterbox_sidecar.py` into the same app-local-data
/// directory the Python environment lives in (simplest way to give the
/// portable interpreter a real filesystem path to run, since Tauri's
/// resource directory and the writable app-data directory aren't always
/// the same location).
#[tauri::command]
fn chatterbox_start(app: tauri::AppHandle) -> Result<u16, String> {
    use std::os::windows::process::CommandExt;

    let dir = chatterbox_env_dir(&app)?;
    let python_exe = chatterbox_python_exe(&app)?;
    if !python_exe.is_file() {
        return Err("Chatterbox isn't downloaded yet".into());
    }

    let resource_script = app
        .path()
        .resolve("resources/chatterbox_sidecar.py", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let script_path = dir.join("chatterbox_sidecar.py");
    std::fs::copy(&resource_script, &script_path).map_err(|e| e.to_string())?;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const DETACHED_PROCESS: u32 = 0x00000008;
    std::process::Command::new(&python_exe)
        .arg(&script_path)
        .arg(CHATTERBOX_PORT.to_string())
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(CHATTERBOX_PORT)
}

/// Best-effort stop, same blunt "kill anything matching this" approach
/// as kokoro_stop - this process is a plain python.exe though, not a
/// uniquely-named binary, so kill by matching the script path in the
/// command line instead of by process name (which would also kill any
/// unrelated python.exe the user happens to have running). Uses
/// PowerShell's Get-CimInstance rather than `wmic` - wmic is deprecated/
/// being removed from modern Windows, CIM is the maintained replacement.
#[tauri::command]
fn chatterbox_stop(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let script_path = chatterbox_env_dir(&app)?.join("chatterbox_sidecar.py");
        let needle = script_path.to_string_lossy().replace('\'', "''");
        let ps_script = format!(
            "Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object {{ $_.CommandLine -like '*{}*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}",
            needle
        );
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            now_playing_server_thread();
            obs_volume_meter_server_thread(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            pick_image_file,
            read_text_file,
            write_text_file,
            read_binary_file_base64,
            write_binary_file,
            file_exists,
            resolve_app_data_path,
            set_current_project_path,
            now_playing_info,
            now_playing_sessions,
            obs_list_scenes,
            obs_push_scene,
            obs_list_inputs,
            preview_overlay,
            copy_to_clipboard,
            kokoro_model_status,
            kokoro_download_model,
            kokoro_start,
            kokoro_stop,
            chatterbox_model_status,
            chatterbox_download_model,
            chatterbox_start,
            chatterbox_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
