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
/// OAuth/API-key integration per streaming service. `GetCurrentSession()`
/// returns whichever session Windows currently considers "the" active one
/// (usually whatever was most recently played/interacted with) - good
/// enough for a one-track overlay; picking a *specific* app's session
/// among several playing at once isn't exposed here in v1.
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

async fn now_playing_info_impl() -> Result<Option<NowPlayingInfo>, String> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus,
    };

    let manager = GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| e.to_string())?
        .await
        .map_err(|e| e.to_string())?;

    let session = match manager.GetCurrentSession() {
        Ok(s) => s,
        Err(_) => return Ok(None), // nothing is playing anywhere right now
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

    let playing = session
        .GetPlaybackInfo()
        .ok()
        .and_then(|info| info.PlaybackStatus().ok())
        .map(|status| status == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
        .unwrap_or(false);

    let app_id = session
        .SourceAppUserModelId()
        .map(|h| h.to_string())
        .unwrap_or_default();

    Ok(Some(NowPlayingInfo { title, artist, album, playing, app_id }))
}

#[tauri::command]
async fn now_playing_info() -> Result<Option<NowPlayingInfo>, String> {
    now_playing_info_impl().await
}

const NOW_PLAYING_SERVER_PORT: u16 = 5759;

/// Runs forever on its own OS thread, started once at app launch (no
/// explicit Start/Stop step needed, unlike Kokoro/Chatterbox - this has
/// no model to download and costs nothing to just always be available).
/// Every request gets a fresh read of whatever's currently playing plus a
/// permissive CORS header, since the baked scene.html's origin (a local
/// file opened by OBS's Browser Source) isn't the same as
/// 127.0.0.1:5759 and the browser will block the fetch without it.
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
            let body = match tauri::async_runtime::block_on(now_playing_info_impl()) {
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
    let python_dir = dir.join("python");
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

        let _ = app.emit("chatterbox-download-progress", serde_json::json!({ "stage": "Extracting Python runtime" }));
        std::fs::create_dir_all(&python_dir).map_err(|e| e.to_string())?;
        let status = std::process::Command::new("tar")
            .args(["-xzf", &archive_path.to_string_lossy(), "-C", &dir.to_string_lossy(), "--strip-components=1"])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("Failed to extract the portable Python runtime".into());
        }
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
        .setup(|_app| {
            now_playing_server_thread();
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
            now_playing_info,
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
