# =============================================================================
# Start All LLM Hub Services (Windows)
# This script runs at startup via Task Scheduler
# =============================================================================

$logFile = "C:\llm-hub\logs\startup.log"
$appDir = "C:\llm-hub\app"

# Create logs directory
New-Item -ItemType Directory -Force -Path "C:\llm-hub\logs" | Out-Null

function Log {
    param([string]$message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $message" | Out-File -Append -FilePath $logFile
    Write-Host $message
}

Log "=== Starting LLM Hub Services ==="

# -----------------------------------------------------------------------------
# 1. Wait for Ollama service (installed as Windows service)
# -----------------------------------------------------------------------------
Log "Waiting for Ollama service..."
$attempts = 0
while ($attempts -lt 30) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -TimeoutSec 2 -ErrorAction Stop
        Log "Ollama is ready!"
        break
    } catch {
        $attempts++
        Start-Sleep -Seconds 2
    }
}

if ($attempts -eq 30) {
    Log "WARNING: Ollama not responding, starting manually..."
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 5
}

# -----------------------------------------------------------------------------
# 2. Start Next.js API Server
# -----------------------------------------------------------------------------
Log "Starting Next.js API server..."
Set-Location $appDir

# Start in background
$apiProcess = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $appDir -WindowStyle Hidden -PassThru
Log "API server started (PID: $($apiProcess.Id))"

# Wait for API to be ready
Start-Sleep -Seconds 10
$attempts = 0
while ($attempts -lt 30) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 2 -ErrorAction Stop
        Log "API server is ready!"
        break
    } catch {
        $attempts++
        Start-Sleep -Seconds 2
    }
}

# -----------------------------------------------------------------------------
# 3. Start Cloudflare Tunnel
# -----------------------------------------------------------------------------
Log "Starting Cloudflare Tunnel..."

$tunnelProcess = Start-Process -FilePath "C:\cloudflared\cloudflared.exe" -ArgumentList "tunnel run llm-hub" -WindowStyle Hidden -PassThru
Log "Cloudflare Tunnel started (PID: $($tunnelProcess.Id))"

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
Log "=== All services started ==="
Log "API available at: https://llm.yourdomain.com"

# Keep script running to maintain processes
while ($true) {
    Start-Sleep -Seconds 60

    # Health check
    try {
        Invoke-WebRequest -Uri "http://localhost:3000/api/health" -TimeoutSec 5 -ErrorAction Stop | Out-Null
    } catch {
        Log "WARNING: API health check failed, restarting..."
        Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
        $apiProcess = Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $appDir -WindowStyle Hidden -PassThru
    }
}
