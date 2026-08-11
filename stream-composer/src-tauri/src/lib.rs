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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            pick_image_file,
            read_text_file,
            write_text_file,
            read_binary_file_base64,
            write_binary_file,
            file_exists,
            preview_overlay,
            copy_to_clipboard,
            kokoro_model_status,
            kokoro_download_model,
            kokoro_start,
            kokoro_stop,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
