$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8000
$url = "http://localhost:$port"

Write-Host "Starting Chess Plus at $url" -ForegroundColor Cyan
Write-Host "Press Ctrl+C in this window to stop the server." -ForegroundColor DarkGray

try {
  Start-Process $url | Out-Null
} catch {
  Write-Host "Could not automatically open the browser. Open $url manually." -ForegroundColor Yellow
}

python -m http.server $port --directory $projectRoot
