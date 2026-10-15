[CmdletBinding()]
param(
  [string]$InstallRoot = "$env:ProgramData\NetDenty\Server",
  [string]$ClinicName = "Main Clinic",
  [string]$AdministratorUsername = "administrator",
  [string]$AdministratorPassword,
  [string]$ServerName = $env:COMPUTERNAME,
  [switch]$SkipLocalWorkstation
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Administrator)) {
  $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"")
  if ($InstallRoot) { $arguments += @("-InstallRoot", "`"$InstallRoot`"") }
  if ($ClinicName) { $arguments += @("-ClinicName", "`"$ClinicName`"") }
  if ($AdministratorUsername) { $arguments += @("-AdministratorUsername", "`"$AdministratorUsername`"") }
  if ($ServerName) { $arguments += @("-ServerName", "`"$ServerName`"") }
  if ($SkipLocalWorkstation) { $arguments += "-SkipLocalWorkstation" }
  $process = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  exit $process.ExitCode
}

function New-DeploymentPassword {
  $bytes = New-Object byte[] 24
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($bytes) }
  finally { $generator.Dispose() }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "A").Replace("/", "B")
}

function Read-PlainPassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "$FailureMessage (exit code $exitCode)." }
}

if ($AdministratorUsername -notmatch '^[a-z0-9._-]{3,64}$') {
  throw "Administrator username must contain 3-64 lowercase letters, digits, periods, underscores or hyphens."
}
if (-not $AdministratorPassword) {
  $AdministratorPassword = Read-PlainPassword "Create the NetDenty administrator password (12-128 characters)"
  $confirmation = Read-PlainPassword "Confirm the administrator password"
  if ($AdministratorPassword -cne $confirmation) { throw "Administrator passwords do not match." }
}
if ($AdministratorPassword.Length -lt 12 -or $AdministratorPassword.Length -gt 128) {
  throw "Administrator password must contain 12-128 characters."
}
if ($ServerName -notmatch '^[A-Za-z0-9.-]+$') { throw "Server name contains unsupported characters." }
$ServerName = $ServerName.ToLowerInvariant()

$source = $PSScriptRoot
$payloadArchive = Join-Path $source "netdenty-server-payload.zip"
if (-not (Test-Path -LiteralPath $payloadArchive)) { throw "The NetDenty server payload is missing." }
$staging = Join-Path $env:TEMP ("NetDenty-Server-" + [guid]::NewGuid().ToString("N"))
$runtimeRoot = Join-Path $InstallRoot "runtime"
$dataRoot = Join-Path $InstallRoot "data"
$logRoot = Join-Path $InstallRoot "logs"
$patientFiles = Join-Path $dataRoot "patient-files"
$workstationKit = Join-Path $InstallRoot "Workstation Installer"
$apiTaskName = "NetDenty API"
$proxyTaskName = "NetDenty HTTPS"
$installLog = Join-Path $logRoot "install.log"
$transcriptStarted = $false

try {
  Write-Host "Preparing NetDenty server files..."
  New-Item -ItemType Directory -Force -Path $staging, $InstallRoot, $dataRoot, $logRoot, $patientFiles | Out-Null
  Start-Transcript -LiteralPath $installLog -Append | Out-Null
  $transcriptStarted = $true
  $installDrive = New-Object System.IO.DriveInfo -ArgumentList ([System.IO.Path]::GetPathRoot($InstallRoot))
  if ($installDrive.AvailableFreeSpace -lt 6GB) {
    throw "NetDenty Server requires at least 6 GB of free space on $($installDrive.Name)."
  }
  & icacls.exe $dataRoot /inheritance:r /grant:r "SYSTEM:(OI)(CI)(F)" "Administrators:(OI)(CI)(F)" | Out-Null
  $tar = Join-Path $env:SystemRoot "System32\tar.exe"
  if (-not (Test-Path -LiteralPath $tar)) { throw "Windows tar.exe is not available." }
  Invoke-Checked $tar @("-xf", $payloadArchive, "-C", $staging) "Server payload extraction failed"
  if (Test-Path -LiteralPath $runtimeRoot) { Remove-Item -LiteralPath $runtimeRoot -Recurse -Force }
  Copy-Item -LiteralPath (Join-Path $staging "runtime") -Destination $runtimeRoot -Recurse -Force

  $postgresInstaller = Get-ChildItem -LiteralPath (Join-Path $staging "vendor") -Filter "postgresql-*-windows-x64.exe" | Select-Object -First 1
  $psql = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
  $postgresSuperPassword = New-DeploymentPassword
  if (-not $psql) {
    if (-not $postgresInstaller) { throw "The bundled PostgreSQL installer is missing." }
    Write-Host "Installing PostgreSQL..."
    $postgresPrefix = Join-Path $env:ProgramFiles "PostgreSQL\18"
    $postgresData = Join-Path $env:ProgramData "PostgreSQL\18\data"
    Invoke-Checked $postgresInstaller.FullName @(
      "--mode", "unattended", "--unattendedmodeui", "minimal",
      "--prefix", $postgresPrefix, "--datadir", $postgresData,
      "--serverport", "5432", "--servicename", "postgresql-netdenty",
      "--superpassword", $postgresSuperPassword, "--servicepassword", $postgresSuperPassword,
      "--enable-components", "server,commandlinetools", "--create_shortcuts", "0"
    ) "PostgreSQL installation failed"
    $psql = Get-Item (Join-Path $postgresPrefix "bin\psql.exe")
  } else {
    Write-Host "Using the installed PostgreSQL instance at $($psql.Directory.Parent.FullName)."
    $postgresSuperPassword = Read-PlainPassword "Enter the existing PostgreSQL postgres-account password"
  }

  $dbPassword = New-DeploymentPassword
  $sqlPath = Join-Path $staging "provision.sql"
  $escapedPassword = $dbPassword.Replace("'", "''")
  @"
SELECT 'CREATE ROLE clinic LOGIN PASSWORD ''$escapedPassword'''
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'clinic')\gexec
ALTER ROLE clinic WITH LOGIN PASSWORD '$escapedPassword';
SELECT 'CREATE DATABASE dental_clinic OWNER clinic'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'dental_clinic')\gexec
ALTER DATABASE dental_clinic OWNER TO clinic;
"@ | Set-Content -LiteralPath $sqlPath -Encoding UTF8
  Write-Host "Creating the NetDenty database..."
  $env:PGPASSWORD = $postgresSuperPassword
  try { Invoke-Checked $psql.FullName @("-h", "127.0.0.1", "-p", "5432", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", $sqlPath) "Database provisioning failed" }
  finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

  $encodedDbPassword = [uri]::EscapeDataString($dbPassword)
  $apiRoot = Join-Path $runtimeRoot "api"
  $webRoot = Join-Path $runtimeRoot "web"
  $node = Join-Path $runtimeRoot "node.exe"
  $databaseUrl = "postgresql://clinic:$encodedDbPassword@127.0.0.1:5432/dental_clinic?schema=public"
  $origin = "https://$ServerName"
  $environmentPath = Join-Path $apiRoot ".env"
  @"
DATABASE_URL=$databaseUrl
HOST=127.0.0.1
PORT=4310
APP_ORIGIN=$origin
COOKIE_SECURE=true
SESSION_HOURS=12
WEB_DIST=$webRoot
PATIENT_FILES_DIR=$patientFiles
POSTGRES_BIN=$($psql.Directory.FullName)
"@ | Set-Content -LiteralPath $environmentPath -Encoding ASCII
  & icacls.exe $environmentPath /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)" | Out-Null

  Write-Host "Applying all database migrations..."
  $env:DATABASE_URL = $databaseUrl
  try {
    Invoke-Checked $node @((Join-Path $apiRoot "node_modules\prisma\build\index.js"), "migrate", "deploy", "--schema", (Join-Path $apiRoot "prisma\schema.prisma")) "Database migration failed"
    $env:ADMIN_USERNAME = $AdministratorUsername
    $env:ADMIN_PASSWORD = $AdministratorPassword
    $env:ADMIN_IF_MISSING = "true"
    Invoke-Checked $node @((Join-Path $apiRoot "create-admin.mjs")) "Administrator creation failed"
  } finally {
    Remove-Item Env:DATABASE_URL, Env:ADMIN_USERNAME, Env:ADMIN_PASSWORD, Env:ADMIN_IF_MISSING -ErrorAction SilentlyContinue
  }

  $escapedClinic = $ClinicName.Replace("'", "''")
  "UPDATE `"Clinic`" SET name = '$escapedClinic' WHERE id = 1;" | Set-Content -LiteralPath $sqlPath -Encoding UTF8
  $env:PGPASSWORD = $dbPassword
  try { Invoke-Checked $psql.FullName @("-h", "127.0.0.1", "-U", "clinic", "-d", "dental_clinic", "-v", "ON_ERROR_STOP=1", "-f", $sqlPath) "Clinic configuration failed" }
  finally { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }

  Write-Host "Registering the NetDenty server startup tasks..."
  Unregister-ScheduledTask -TaskName $apiTaskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $proxyTaskName -Confirm:$false -ErrorAction SilentlyContinue
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $apiAction = New-ScheduledTaskAction -Execute $node -Argument "`"$(Join-Path $apiRoot 'server.mjs')`"" -WorkingDirectory $apiRoot
  Register-ScheduledTask -TaskName $apiTaskName -Action $apiAction -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

  $caddy = Join-Path $runtimeRoot "caddy.exe"
  if (-not (Test-Path -LiteralPath $caddy)) { throw "The bundled HTTPS proxy is missing." }
  $caddyData = Join-Path $dataRoot "caddy"
  $caddyFile = Join-Path $runtimeRoot "Caddyfile"
  @"
$origin {
  tls internal
  encode zstd gzip
  reverse_proxy 127.0.0.1:4310
}
"@ | Set-Content -LiteralPath $caddyFile -Encoding ASCII
  $caddyRunner = Join-Path $runtimeRoot "Run-Caddy.ps1"
  @"
`$env:XDG_DATA_HOME = '$($caddyData.Replace("'", "''"))'
`$env:XDG_CONFIG_HOME = '$($caddyData.Replace("'", "''"))'
& '$($caddy.Replace("'", "''"))' run --config '$($caddyFile.Replace("'", "''"))' --adapter caddyfile
"@ | Set-Content -LiteralPath $caddyRunner -Encoding UTF8
  $proxyAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$caddyRunner`"" -WorkingDirectory $runtimeRoot
  Register-ScheduledTask -TaskName $proxyTaskName -Action $proxyAction -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  if (-not (Get-NetFirewallRule -DisplayName "NetDenty HTTPS" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "NetDenty HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Private,Domain | Out-Null
  }
  Start-ScheduledTask -TaskName $apiTaskName
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $proxyTaskName

  $deadline = (Get-Date).AddSeconds(60)
  do {
    Start-Sleep -Seconds 1
    $rootCertificate = Get-ChildItem -LiteralPath $caddyData -Filter "root.crt" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  } until ($rootCertificate -or (Get-Date) -ge $deadline)
  if (-not $rootCertificate) { throw "HTTPS certificate creation did not complete. Review the Caddy task log." }
  Import-Certificate -FilePath $rootCertificate.FullName -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null

  Write-Host "Creating the one-click workstation installation kit..."
  if (Test-Path -LiteralPath $workstationKit) { Remove-Item -LiteralPath $workstationKit -Recurse -Force }
  New-Item -ItemType Directory -Path $workstationKit | Out-Null
  Copy-Item -LiteralPath (Join-Path $staging "workstation\NetDenty-Workstation-Setup.exe") -Destination $workstationKit
  Copy-Item -LiteralPath (Join-Path $staging "workstation\Install-NetDentyWorkstation.ps1") -Destination $workstationKit
  Copy-Item -LiteralPath (Join-Path $staging "workstation\Install-NetDentyWorkstation.cmd") -Destination $workstationKit
  Copy-Item -LiteralPath $rootCertificate.FullName -Destination (Join-Path $workstationKit "netdenty-root.crt")
  @{ apiBaseUrl = $origin; serverName = $ServerName } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $workstationKit "connection.json") -Encoding UTF8

  if (-not $SkipLocalWorkstation) {
    & (Join-Path $workstationKit "Install-NetDentyWorkstation.ps1") -NoElevation
  }
  $desktopKit = Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "NetDenty Workstation Installer"
  if (Test-Path -LiteralPath $desktopKit) { Remove-Item -LiteralPath $desktopKit -Recurse -Force }
  Copy-Item -LiteralPath $workstationKit -Destination $desktopKit -Recurse

  $health = Invoke-RestMethod -Uri "http://127.0.0.1:4310/health" -TimeoutSec 10
  if ($health.status -ne "ok") { throw "The NetDenty API health check failed." }
  Write-Host ""
  Write-Host "NetDenty Server installation completed successfully." -ForegroundColor Green
  Write-Host "Server address: $origin"
  Write-Host "Administrator username: $AdministratorUsername"
  Write-Host "Copy the 'NetDenty Workstation Installer' folder from the Public Desktop to each clinic workstation."
} catch {
  $failure = $_.Exception.Message
  Write-Host "ERROR: $failure" -ForegroundColor Red
  exit 1
} finally {
  $AdministratorPassword = $null
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  if ($transcriptStarted) { try { Stop-Transcript | Out-Null } catch { } }
}
