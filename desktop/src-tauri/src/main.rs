// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};

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

// ---------------------------------------------------------------------------
// MCP (Model Context Protocol) stdio transport
//
// Each MCP server is a long-lived child process we talk to over stdin/stdout
// using newline-delimited JSON-RPC. We keep a registry of running servers; a
// per-server Mutex serializes requests to that server while letting different
// servers run concurrently. Requests block until the response with the matching
// JSON-RPC id arrives (notifications and other ids are skipped).
// ---------------------------------------------------------------------------
struct McpProc {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<ChildStdout>,
}

fn mcp_registry() -> &'static Mutex<HashMap<String, Arc<Mutex<McpProc>>>> {
    static REG: OnceLock<Mutex<HashMap<String, Arc<Mutex<McpProc>>>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Spawn an MCP server child process (idempotent per id).
#[tauri::command]
fn mcp_spawn(
    id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    cwd: Option<String>,
) -> Result<(), String> {
    {
        let reg = mcp_registry().lock().map_err(|_| "registry lock poisoned")?;
        if reg.contains_key(&id) {
            return Ok(());
        }
    }
    let mut cmd = Command::new(&command);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    // GUI-launched apps inherit a stripped PATH; make common bin dirs reachable
    // so `npx`, `uvx`, etc. resolve.
    let path = std::env::var("PATH").unwrap_or_default();
    cmd.env("PATH", format!("{}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin", path));
    for (k, v) in &env {
        cmd.env(k, v);
    }
    if let Some(d) = cwd {
        if !d.is_empty() {
            cmd.current_dir(d);
        }
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Could not start MCP server '{}' ({}): {}", id, command, e))?;
    let stdin = child.stdin.take().ok_or("failed to open MCP server stdin")?;
    let stdout = child.stdout.take().ok_or("failed to open MCP server stdout")?;
    let proc = McpProc {
        child,
        stdin,
        reader: BufReader::new(stdout),
    };
    mcp_registry()
        .lock()
        .map_err(|_| "registry lock poisoned")?
        .insert(id, Arc::new(Mutex::new(proc)));
    Ok(())
}

/// Send a JSON-RPC request and block until the response with `request_id` arrives.
#[tauri::command]
fn mcp_request(id: String, request: String, request_id: i64) -> Result<String, String> {
    let arc = {
        let reg = mcp_registry().lock().map_err(|_| "registry lock poisoned")?;
        reg.get(&id)
            .cloned()
            .ok_or_else(|| format!("MCP server '{}' is not running", id))?
    };
    let mut p = arc.lock().map_err(|_| "MCP server lock poisoned")?;
    p.stdin
        .write_all(request.as_bytes())
        .and_then(|_| p.stdin.write_all(b"\n"))
        .and_then(|_| p.stdin.flush())
        .map_err(|e| format!("MCP write failed: {}", e))?;

    // Read newline-delimited JSON objects until we get the matching response.
    // The cap bounds runaway chatter; a well-behaved server replies quickly.
    for _ in 0..100_000 {
        let mut line = String::new();
        let n = p
            .reader
            .read_line(&mut line)
            .map_err(|e| format!("MCP read failed: {}", e))?;
        if n == 0 {
            return Err("MCP server closed the connection".to_string());
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(trimmed) {
            if v.get("id").and_then(|x| x.as_i64()) == Some(request_id) {
                return Ok(trimmed.to_string());
            }
            // else: a notification or a different id — keep reading.
        }
    }
    Err("no matching MCP response received".to_string())
}

/// Send a JSON-RPC notification (no response expected).
#[tauri::command]
fn mcp_notify(id: String, request: String) -> Result<(), String> {
    let arc = {
        let reg = mcp_registry().lock().map_err(|_| "registry lock poisoned")?;
        reg.get(&id)
            .cloned()
            .ok_or_else(|| format!("MCP server '{}' is not running", id))?
    };
    let mut p = arc.lock().map_err(|_| "MCP server lock poisoned")?;
    p.stdin
        .write_all(request.as_bytes())
        .and_then(|_| p.stdin.write_all(b"\n"))
        .and_then(|_| p.stdin.flush())
        .map_err(|e| format!("MCP write failed: {}", e))
}

/// Kill an MCP server and drop it from the registry.
#[tauri::command]
fn mcp_stop(id: String) -> Result<(), String> {
    if let Some(arc) = mcp_registry()
        .lock()
        .map_err(|_| "registry lock poisoned")?
        .remove(&id)
    {
        if let Ok(mut p) = arc.lock() {
            let _ = p.child.kill();
        }
    }
    Ok(())
}

/// Kill every running MCP server (used on app exit).
fn kill_all_mcp() {
    if let Ok(mut reg) = mcp_registry().lock() {
        for (_, arc) in reg.drain() {
            if let Ok(mut p) = arc.lock() {
                let _ = p.child.kill();
            }
        }
    }
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

/// Unload all loaded Ollama models so VRAM frees the moment the app closes
/// (Ollama otherwise keeps them ~5 min). Runs synchronously; sets a full PATH
/// so the `ollama` binary is found under the stripped GUI-app environment.
fn unload_ollama_models() {
    let _ = Command::new("sh")
        .arg("-c")
        .arg("export PATH=\"$PATH:/opt/homebrew/bin:/usr/local/bin\"; ollama ps 2>/dev/null | awk 'NR>1{print $1}' | xargs -I{} ollama stop {} >/dev/null 2>&1")
        .status();
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|_window, event| {
            // Close button → CloseRequested; Cmd+Q tears the window down → Destroyed.
            match event {
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                    kill_all_mcp();
                    unload_ollama_models();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            exec_shell,
            list_directory,
            search_files,
            start_ollama,
            mcp_spawn,
            mcp_request,
            mcp_notify,
            mcp_stop,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Catch every exit path (incl. Cmd+Q, which skips ExitRequested).
            match event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    kill_all_mcp();
                    unload_ollama_models();
                }
                _ => {}
            }
        });
}
