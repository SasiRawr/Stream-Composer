// ============================================================================
// Scene Composer — Rust backend
// ============================================================================
// Same small-explicit-commands pattern as the Popup Slide Editor's app/src-tauri —
// see that file's comments for the full reasoning. This one adds a couple
// of binary-file commands on top, since Scene Composer needs to import
// arbitrary image files (logos, graphics) and copy them into a baked
// project's assets/ folder.
// ============================================================================

use base64::Engine;
use tauri_plugin_dialog::DialogExt;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_project_folder,
            pick_image_file,
            read_text_file,
            write_text_file,
            read_binary_file_base64,
            write_binary_file,
            file_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
