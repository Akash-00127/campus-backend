$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$adminRoot = Join-Path (Split-Path -Parent $projectRoot) 'campus admin'
$nodePath = (Get-Command node.exe).Source
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$dataPath = Join-Path $projectRoot '.local\test-pg'
if (!(Test-Path -LiteralPath (Join-Path $dataPath 'PG_VERSION'))) { throw 'Local PostgreSQL cluster is missing. Follow README.md setup instructions.' }
Push-Location $projectRoot
try {
  & $nodePath 'node_modules/typescript/bin/tsc' '-p' 'tsconfig.json'
  if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
  & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p 55439 -U campus_test | Out-Null
  if ($LASTEXITCODE -ne 0) {
    $pgLog = Join-Path $projectRoot '.local\postgres.log'
    $pg = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList @('-D',('"'+$dataPath+'"'),'-l',('"'+$pgLog+'"'),'-o','"-p 55439 -h 127.0.0.1"','-w','start') -WindowStyle Hidden -PassThru
    if (!$pg.WaitForExit(60000)) { throw 'PostgreSQL startup timed out. Check .local\postgres.log.' }
    if ($pg.ExitCode -ne 0) { throw "PostgreSQL startup failed. See $pgLog" }
  }
  $apiReady = $false
  try { $apiReady = (Invoke-RestMethod -Uri 'http://127.0.0.1:4000/v1/health' -TimeoutSec 2).status -eq 'ok' } catch {}
  if (!$apiReady) {
    Start-Process -FilePath $nodePath -ArgumentList 'dist/main.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.local\api.log') -RedirectStandardError (Join-Path $projectRoot '.local\api-error.log') | Out-Null
  }
  $adminReady = $false
  try { $adminReady = (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/login' -TimeoutSec 3).StatusCode -eq 200 } catch {}
  if (!$adminReady) {
    Start-Process -FilePath $nodePath -ArgumentList @('node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1') -WorkingDirectory $adminRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.local\admin.log') -RedirectStandardError (Join-Path $projectRoot '.local\admin-error.log') | Out-Null
  }
  Write-Output 'Local services started. Admin: http://127.0.0.1:3000/login | API: http://127.0.0.1:4000/v1/health'
  Write-Output 'Owner credentials are in .local\LOCAL-ACCESS.txt. Logs are in .local. Use a development build for mobile push.'
} finally { Pop-Location }
