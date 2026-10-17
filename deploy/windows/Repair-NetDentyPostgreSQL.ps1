[CmdletBinding()]
param(
  [string]$InstallRoot = "$env:ProgramData\NetDenty\Server"
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  throw "Run this repair script from PowerShell as administrator."
}

$secretPath = Join-Path $InstallRoot "data\postgres-bootstrap.secret"
if (-not (Test-Path -LiteralPath $secretPath)) {
  New-Item -ItemType Directory -Force -Path (Split-Path $secretPath -Parent) | Out-Null
  $bytes = New-Object byte[] 24
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
  $generatedPassword = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "A").Replace("/", "B")
  $generatedPassword | Set-Content -LiteralPath $secretPath -Encoding ASCII -NoNewline
  & icacls.exe $secretPath /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)" | Out-Null
}
$bootstrapPassword = (Get-Content -Raw -LiteralPath $secretPath).Trim()
if (-not $bootstrapPassword) { throw "The PostgreSQL bootstrap credential is empty." }

$service = Get-Service -Name "postgresql-netdenty" -ErrorAction SilentlyContinue
if (-not $service) {
  $service = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending |
    Select-Object -First 1
}
if (-not $service) { throw "No PostgreSQL Windows service was found." }

$serviceInfo = Get-CimInstance Win32_Service -Filter "Name='$($service.Name)'"
$serviceCommand = [string]$serviceInfo.PathName
$dataDirectory = $null
if ($serviceCommand -match '(?i)-D\s+"([^"]+)"') {
  $dataDirectory = $matches[1]
} elseif ($serviceCommand -match '(?i)-D\s+([^\s]+)') {
  $dataDirectory = $matches[1]
}
if (-not $dataDirectory) {
  $dataDirectory = Join-Path $env:ProgramData "PostgreSQL\18\data"
}
$pgHba = Join-Path $dataDirectory "pg_hba.conf"
if (-not (Test-Path -LiteralPath $pgHba)) {
  throw "PostgreSQL authentication configuration was not found at $pgHba."
}

$psql = @(
  $env:ProgramW6432,
  $env:ProgramFiles,
  ${env:ProgramFiles(x86)}
) | Where-Object { $_ } | Select-Object -Unique | ForEach-Object {
  Get-ChildItem (Join-Path $_ "PostgreSQL\*\bin\psql.exe") -ErrorAction SilentlyContinue
} | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $psql) { throw "psql.exe was not found in the installed PostgreSQL directories." }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "$pgHba.netdenty-$stamp.bak"
$sqlPath = Join-Path $env:TEMP "netdenty-reset-postgres-$stamp.sql"
$originalHba = [IO.File]::ReadAllText($pgHba)
$escapedPassword = $bootstrapPassword.Replace("'", "''")

Copy-Item -LiteralPath $pgHba -Destination $backupPath -Force
try {
  $temporaryRules = @"
# Temporary NetDenty local administrator recovery rule
host all postgres 127.0.0.1/32 trust
host all postgres ::1/128 trust
"@
  [IO.File]::WriteAllText(
    $pgHba,
    $temporaryRules + "`r`n" + $originalHba,
    (New-Object Text.UTF8Encoding($false))
  )
  Restart-Service -Name $service.Name -Force
  (Get-Service -Name $service.Name).WaitForStatus("Running", (New-TimeSpan -Seconds 60))

  "ALTER ROLE postgres WITH LOGIN PASSWORD '$escapedPassword';" |
    Set-Content -LiteralPath $sqlPath -Encoding ASCII
  & $psql.FullName -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $sqlPath
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL password reset failed with exit code $LASTEXITCODE." }
} finally {
  Copy-Item -LiteralPath $backupPath -Destination $pgHba -Force
  Restart-Service -Name $service.Name -Force
  Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
}

$env:PGPASSWORD = $bootstrapPassword
try {
  & $psql.FullName -h 127.0.0.1 -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT current_user, current_database();"
  if ($LASTEXITCODE -ne 0) { throw "The repaired PostgreSQL administrator login could not be verified." }
} finally {
  Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  $bootstrapPassword = $null
}

Write-Host "PostgreSQL administrator access was repaired successfully." -ForegroundColor Green
Write-Host "Run the current NetDenty server installer again to create the application role, database, tables and administrator."
