param([switch]$WithClients)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
  if ($WithClients) {
    foreach ($folder in @('campus admin', 'campus app')) {
      $manifest = Join-Path (Split-Path -Parent $projectRoot) "$folder\package.json"
      if (!(Test-Path -LiteralPath $manifest)) { throw "Missing sibling project: $folder" }
    }
    & docker compose --profile clients up -d --build --wait
  } else {
    & docker compose up -d --build --wait
  }
  if ($LASTEXITCODE -ne 0) { throw 'Service startup failed. Run docker compose logs for details.' }
  Write-Output 'API ready: http://127.0.0.1:4000/v1/health'
  if ($WithClients) { Write-Output 'Admin: http://localhost:3010 | App: http://localhost:8090' }
} finally { Pop-Location }
