// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
pub struct ShellOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

/// Read file contents
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write file contents (creates parent dirs)
#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directories: {}", e))?;
    }
    fs::write(&path, &content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Execute a shell command
#[tauri::command]
fn exec_shell(command: String, cwd: Option<String>) -> Result<ShellOutput, String> {
    let mut cmd = Command::new("sh");
    cmd.arg("-c").arg(&command);
    if let Some(dir) = cwd {
        if !dir.is_empty() {
            cmd.current_dir(dir);
        }
    }
    let output = cmd.output().map_err(|e| format!("Failed to execute command: {}", e))?;
    Ok(ShellOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

/// List directory contents
#[tauri::command]
fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        result.push(FileEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: entry.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    Ok(result)
}

/// Search files with a glob pattern
#[tauri::command]
fn search_files(pattern: String, cwd: String) -> Result<Vec<String>, String> {
    let full_pattern = format!("{}/{}", cwd, pattern);
    let paths: Vec<String> = glob::glob(&full_pattern)
        .map_err(|e| format!("Invalid pattern: {}", e))?
        .filter_map(|entry| entry.ok())
        .map(|path| path.to_string_lossy().to_string())
        .collect();
    Ok(paths)
}

/// Launch the local Ollama daemon (`ollama serve`) detached, for offline use.
#[tauri::command]
fn start_ollama() -> Result<String, String> {
    Command::new("ollama")
        .arg("serve")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start Ollama (is it installed?): {}", e))?;
    Ok("Ollama starting".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            exec_shell,
            list_directory,
            search_files,
            start_ollama,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
