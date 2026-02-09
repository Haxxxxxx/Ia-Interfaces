# =============================================================================
# Shadow PC Setup Script (Windows PowerShell)
# Run as Administrator
# =============================================================================

Write-Host "=== Shadow PC LLM Hub Setup ===" -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# 1. Install Ollama
# -----------------------------------------------------------------------------
Write-Host "`n[1/4] Installing Ollama..." -ForegroundColor Yellow

# Download and install Ollama
$ollamaInstaller = "$env:TEMP\OllamaSetup.exe"
Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaInstaller
Start-Process -FilePath $ollamaInstaller -Wait

Write-Host "Ollama installed. Pulling models..." -ForegroundColor Green

# Pull models (run after Ollama service starts)
Start-Sleep -Seconds 5

# Essential models (pull these first)
Write-Host "Pulling essential models..." -ForegroundColor Yellow
ollama pull qwen2.5-coder:14b   # Best for code (9GB)
ollama pull qwen2.5:7b          # Fast chat (5GB)
ollama pull llama3.2:3b         # Ultra-fast fallback (2GB)

Write-Host "Essential models ready! Pulling additional models in background..." -ForegroundColor Green

# Additional models (optional, pull in background)
Start-Job -ScriptBlock {
    ollama pull deepseek-coder:6.7b
    ollama pull qwen2.5-coder:7b
    ollama pull mistral:7b
}

# -----------------------------------------------------------------------------
# 2. Install Node.js
# -----------------------------------------------------------------------------
Write-Host "`n[2/4] Installing Node.js..." -ForegroundColor Yellow

# Using winget (built into Windows 11)
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

# Refresh PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# -----------------------------------------------------------------------------
# 3. Clone and Setup App
# -----------------------------------------------------------------------------
Write-Host "`n[3/4] Setting up LLM Hub..." -ForegroundColor Yellow

$appDir = "C:\llm-hub"

# Clone repo (or copy from your machine)
if (Test-Path $appDir) {
    Write-Host "Directory exists, pulling latest..." -ForegroundColor Gray
    Set-Location $appDir
    git pull
} else {
    git clone https://github.com/Haxxolotto/Ia-Interfaces.git $appDir
}

Set-Location "$appDir\app"

# Install dependencies
npm install

# Create .env if not exists
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env - EDIT THIS FILE with your settings!" -ForegroundColor Red
}

# Build
npm run build

# Create data directory
New-Item -ItemType Directory -Force -Path "data"

# -----------------------------------------------------------------------------
# 4. Install Cloudflared
# -----------------------------------------------------------------------------
Write-Host "`n[4/4] Installing Cloudflare Tunnel..." -ForegroundColor Yellow

$cloudflaredPath = "C:\cloudflared"
New-Item -ItemType Directory -Force -Path $cloudflaredPath

Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$cloudflaredPath\cloudflared.exe"

# Add to PATH
$currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($currentPath -notlike "*$cloudflaredPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$cloudflaredPath", "Machine")
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host @"

Next steps:
1. Edit C:\llm-hub\app\.env with your API keys
2. Run: cloudflared tunnel login
3. Run: C:\llm-hub\scripts\windows\create-startup-task.ps1
4. Restart Shadow PC to test auto-start

"@ -ForegroundColor Cyan
