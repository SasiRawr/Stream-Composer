// ============================================================================
// Stream-Builder v2 — Rust backend (the "src-tauri" side of the app)
// ============================================================================
// The frontend (src/main.js) can't touch the filesystem directly — that's
// the whole reason this is a desktop app and not a webpage (see the
// "browser file-write" section of HANDOFF_FOR_CLAUDE_CODE.md). Instead, the
// frontend calls one of the commands below via `invoke("command_name", {...})`,
// and Rust does the actual disk/OS work on its behalf. Everything here is
// deliberately small and literal — no framework magic, just: pick a folder,
// read a file, write a file, open a file.
// ============================================================================

use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Opens the operating system's native "choose a folder" dialog and waits
/// for the user to either pick one or cancel. Returns the chosen folder's
/// full path as a String, or `None` if the dialog was cancelled — the
/// frontend treats `None` as "do nothing, the user backed out."
#[tauri::command]
fn pick_project_folder(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .and_then(|file_path| file_path.into_path().ok())
        .map(|path_buf| path_buf.to_string_lossy().to_string())
}

/// Reads a text file from disk (e.g. a project's settings.js) and hands the
/// full contents back to the frontend as a String.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|err| format!("Couldn't read {}: {}", path, err))
}

/// Overwrites a text file on disk with new contents. This is the actual fix
/// for the problem that started the whole v2 project: a webpage can only
/// ever trigger a download and ask you to manually replace the old file —
/// this writes straight back to the original file, in place, no shuffling
/// files out of a Downloads folder required.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|err| format!("Couldn't write {}: {}", path, err))
}

/// Quick existence check. Used before treating a folder the user picked as
/// a real "Project" — if it doesn't have a settings.js sitting in it, it's
/// not a v1 popup-slide campaign and we should say so instead of guessing.
#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

/// Opens a file with whatever the operating system's default app for it is.
/// Used by the "Preview" button: it opens stream-popup-overlay.html in the
/// user's normal browser, so they can watch the popup actually animate —
/// the exact same HTML/CSS/JS engine OBS uses when this is added as a
/// Browser Source, just viewed in a regular browser tab instead.
#[tauri::command]
fn preview_overlay(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            read_text_file,
            write_text_file,
            file_exists,
            preview_overlay,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
