# =============================================================================
# Create Windows Startup Task for LLM Hub
# Run as Administrator
# =============================================================================

Write-Host "Creating startup task for LLM Hub..." -ForegroundColor Cyan

$taskName = "LLM-Hub-AutoStart"
$scriptPath = "C:\llm-hub\scripts\windows\start-services.ps1"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Create action
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# Create trigger (at startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Create settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# Create principal (run as SYSTEM for reliability)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Auto-start LLM Hub services on boot"

Write-Host "`nStartup task created!" -ForegroundColor Green
Write-Host @"

The following will auto-start when Shadow PC boots:
  1. Ollama (model inference)
  2. Next.js API server (port 3000)
  3. Cloudflare Tunnel (HTTPS access)

To test now, run:
  Start-ScheduledTask -TaskName "$taskName"

To check status:
  Get-ScheduledTask -TaskName "$taskName"

"@ -ForegroundColor Cyan
