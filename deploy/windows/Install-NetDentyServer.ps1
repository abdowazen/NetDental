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

# The graphical installer passes these values through the child-process
# environment so secrets never appear in the process command line.
if ($env:NETDENTY_INSTALL_CLINIC_NAME) {
  $ClinicName = $env:NETDENTY_INSTALL_CLINIC_NAME
}
if ($env:NETDENTY_INSTALL_ADMIN_PASSWORD) {
  $AdministratorPassword = $env:NETDENTY_INSTALL_ADMIN_PASSWORD
}

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
  if ($env:NETDENTY_INSTALL_NONINTERACTIVE -eq '1') {
    throw 'A required password was not supplied on the installer options pages. Restart setup and enter the password there.'
  }
  # NSIS captures console output with nsExec::ExecToLog, so Read-Host has no
  # visible interactive console. Use an explicit masked dialog instead.
  Add-Type -AssemblyName System.Windows.Forms
  $form = New-Object System.Windows.Forms.Form
  try {
    $form.Text = 'NetDenty Server Setup - Password required'
    $form.Width = 540
    $form.Height = 200
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $label = New-Object System.Windows.Forms.Label
    $label.SetBounds(16, 16, 490, 40)
    $label.Text = $Prompt
    $inputBox = New-Object System.Windows.Forms.TextBox
    $inputBox.SetBounds(16, 62, 490, 24)
    $inputBox.UseSystemPasswordChar = $true
    $ok = New-Object System.Windows.Forms.Button
    $ok.Text = 'Continue'
    $ok.SetBounds(316, 108, 90, 28)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $cancel = New-Object System.Windows.Forms.Button
    $cancel.Text = 'Cancel'
    $cancel.SetBounds(416, 108, 90, 28)
    $cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.AddRange(@($label, $inputBox, $ok, $cancel))
    $form.AcceptButton = $ok
    $form.CancelButton = $cancel
    $form.Add_Shown({ $inputBox.Focus() })
    Write-Host 'Waiting for password in the NetDenty Server Setup dialog...'
    if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      throw 'Password entry cancelled. Setup cannot continue.'
    }
    if (-not $inputBox.Text) { throw 'A password is required.' }
    return $inputBox.Text
  } finally {
    if ($inputBox) { $inputBox.Clear() }
    $form.Dispose()
  }
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
  & $FilePath @Arguments
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) { throw "$FailureMessage (exit code $exitCode)." }
}

function Find-PostgresPsql {
  $candidatePaths = New-Object System.Collections.Generic.List[string]
  $programRoots = @(
    $env:ProgramW6432,
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)}
  ) | Where-Object { $_ } | Select-Object -Unique
  foreach ($root in $programRoots) {
    Get-ChildItem (Join-Path $root "PostgreSQL\*\bin\psql.exe") -ErrorAction SilentlyContinue |
      ForEach-Object { [void]$candidatePaths.Add($_.FullName) }
  }
  foreach ($registryRoot in @(
    "HKLM:\SOFTWARE\PostgreSQL\Installations",
    "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations"
  )) {
    Get-ChildItem $registryRoot -ErrorAction SilentlyContinue | ForEach-Object {
      $properties = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      $baseDirectory = $properties.'Base Directory'
      if ($baseDirectory) {
        [void]$candidatePaths.Add((Join-Path $baseDirectory "bin\psql.exe"))
      }
    }
  }
  $candidatePaths |
    Where-Object { Test-Path -LiteralPath $_ } |
    Sort-Object -Unique -Descending |
    Select-Object -First 1 |
    ForEach-Object { Get-Item -LiteralPath $_ }
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
$postgresBootstrapSecret = Join-Path $dataRoot "postgres-bootstrap.secret"
$apiTaskName = "NetDenty API"
$proxyTaskName = "NetDenty HTTPS"
$installLog = Join-Path $logRoot "install.log"
$transcriptStarted = $false
$existingDatabaseUrl = $null

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
  $existingEnvironmentPath = Join-Path $runtimeRoot "api\.env"
  if (Test-Path -LiteralPath $existingEnvironmentPath) {
    $existingDatabaseLine = Get-Content -LiteralPath $existingEnvironmentPath |
      Where-Object { $_ -like "DATABASE_URL=*" } |
      Select-Object -First 1
    if ($existingDatabaseLine) {
      $candidateDatabaseUrl = $existingDatabaseLine.Substring("DATABASE_URL=".Length)
      $candidateDatabaseUri = $null
      if (
        [Uri]::TryCreate($candidateDatabaseUrl, [UriKind]::Absolute, [ref]$candidateDatabaseUri) -and
        $candidateDatabaseUri.Scheme -in @("postgres", "postgresql") -and
        $candidateDatabaseUri.UserInfo
      ) {
        $existingDatabaseUrl = $candidateDatabaseUrl
        Write-Host "Existing NetDenty database configuration found; it will be preserved for this upgrade."
      } else {
        throw "The installed NetDenty DATABASE_URL is invalid. The runtime was not replaced."
      }
    }
  }
  # Stop the installed server before replacing node.exe/caddy.exe. Do not stop
  # development Electron or unrelated Node processes on this same computer.
  foreach ($taskName in @($apiTaskName, $proxyTaskName)) {
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $taskName
    }
  }
  $installedExecutables = @((Join-Path $runtimeRoot 'node.exe'), (Join-Path $runtimeRoot 'caddy.exe'))
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'caddy.exe'" |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath -in $installedExecutables } |
    ForEach-Object {
      $runningProcess = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($runningProcess) {
        Stop-Process -InputObject $runningProcess -Force
        if (-not $runningProcess.WaitForExit(10000)) { throw 'Installed server process did not exit before runtime replacement.' }
      }
    }
  if (Test-Path -LiteralPath $runtimeRoot) { Remove-Item -LiteralPath $runtimeRoot -Recurse -Force }
  Copy-Item -LiteralPath (Join-Path $staging "runtime") -Destination $runtimeRoot -Recurse -Force

  $postgresInstaller = Get-ChildItem -LiteralPath (Join-Path $staging "vendor") -Filter "postgresql-*-windows-x64.exe" | Select-Object -First 1
  # NSIS is a 32-bit process, so a child PowerShell can expose ProgramFiles as
  # Program Files (x86). ProgramW6432 always identifies the native x64 folder.
  $programFiles64 = if ($env:ProgramW6432) { $env:ProgramW6432 } else { $env:ProgramFiles }
  $psql = Find-PostgresPsql
  $postgresSuperPassword = $null
  if (-not $psql) {
    if ($existingDatabaseUrl) {
      throw "An existing NetDenty database configuration was found, but PostgreSQL command-line tools are unavailable. Repair PostgreSQL before upgrading."
    }
    if (-not $postgresInstaller) { throw "The bundled PostgreSQL installer is missing." }
    Write-Host "Installing PostgreSQL..."
    $postgresSuperPassword = New-DeploymentPassword
    $postgresPrefix = Join-Path $programFiles64 "PostgreSQL\18"
    $postgresData = Join-Path $env:ProgramData "PostgreSQL\18\data"
    # Retain the generated bootstrap credential only until the complete setup
    # succeeds. This allows a retry if a later installation step fails.
    $postgresSuperPassword | Set-Content -LiteralPath $postgresBootstrapSecret -Encoding ASCII -NoNewline
    & icacls.exe $postgresBootstrapSecret /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)" | Out-Null
    Invoke-Checked $postgresInstaller.FullName @(
      "--mode", "unattended", "--unattendedmodeui", "minimal",
      "--prefix", $postgresPrefix, "--datadir", $postgresData,
      "--serverport", "5432", "--servicename", "postgresql-netdenty",
      "--superpassword", $postgresSuperPassword, "--servicepassword", $postgresSuperPassword,
      "--enable-components", "server,commandlinetools", "--create_shortcuts", "0"
    ) "PostgreSQL installation failed"
    $discoveryDeadline = (Get-Date).AddSeconds(60)
    do {
      $psql = Find-PostgresPsql
      if (-not $psql) { Start-Sleep -Seconds 2 }
    } until ($psql -or (Get-Date) -ge $discoveryDeadline)
    if (-not $psql) {
      throw "PostgreSQL installation completed but psql.exe was not registered or found in a PostgreSQL bin directory."
    }
    Write-Host "PostgreSQL command-line tools found at $($psql.Directory.FullName)."
  } else {
    Write-Host "Using the installed PostgreSQL instance at $($psql.Directory.Parent.FullName)."
    if ($existingDatabaseUrl) {
      Write-Host "Using the installed NetDenty database credential for the upgrade."
    } elseif (Test-Path -LiteralPath $postgresBootstrapSecret) {
      $postgresSuperPassword = Get-Content -Raw -LiteralPath $postgresBootstrapSecret
      Write-Host "Continuing the previous NetDenty PostgreSQL setup attempt."
    } else {
      if ($env:NETDENTY_INSTALL_POSTGRES_PASSWORD) {
        $postgresSuperPassword = $env:NETDENTY_INSTALL_POSTGRES_PASSWORD
      } else {
        $postgresSuperPassword = Read-PlainPassword "Enter the existing PostgreSQL postgres-account password"
      }
    }
  }

  $postgresService = Get-Service -Name "postgresql-netdenty" -ErrorAction SilentlyContinue
  if (-not $postgresService) {
    $postgresService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      Select-Object -First 1
  }
  if ($postgresService -and $postgresService.Status -ne "Running") {
    Write-Host "Starting PostgreSQL service $($postgresService.Name)..."
    Start-Service -Name $postgresService.Name
  }
  $pgIsReady = Join-Path $psql.Directory.FullName "pg_isready.exe"
  if (-not (Test-Path -LiteralPath $pgIsReady)) {
    throw "PostgreSQL readiness tool was not found beside psql.exe at $($psql.Directory.FullName)."
  }
  Write-Host "Waiting for PostgreSQL to accept connections..."
  $readyDeadline = (Get-Date).AddSeconds(120)
  $postgresReady = $false
  do {
    & $pgIsReady -q -h 127.0.0.1 -p 5432 -d postgres
    $postgresReady = $LASTEXITCODE -eq 0
    if (-not $postgresReady) { Start-Sleep -Seconds 2 }
  } until ($postgresReady -or (Get-Date) -ge $readyDeadline)
  if (-not $postgresReady) {
    $serviceState = if ($postgresService) { (Get-Service -Name $postgresService.Name).Status } else { "not found" }
    throw "PostgreSQL did not accept connections on 127.0.0.1:5432 within 120 seconds. Service state: $serviceState."
  }
  Write-Host "PostgreSQL is ready."

  $sqlPath = Join-Path $staging "provision.sql"
  if ($existingDatabaseUrl) {
    $databaseUrl = $existingDatabaseUrl
    $installedDatabaseUri = [Uri]$databaseUrl
    $installedCredentials = $installedDatabaseUri.UserInfo.Split(":", 2)
    if ($installedCredentials.Count -ne 2) { throw "The installed database credential is incomplete." }
    $dbPassword = [Uri]::UnescapeDataString($installedCredentials[1])
  } else {
    $dbPassword = New-DeploymentPassword
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
    $databaseUrl = "postgresql://clinic:$encodedDbPassword@127.0.0.1:5432/dental_clinic?schema=public"
  }

  $apiRoot = Join-Path $runtimeRoot "api"
  $webRoot = Join-Path $runtimeRoot "web"
  $node = Join-Path $runtimeRoot "node.exe"
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
  Stop-ScheduledTask -TaskName $apiTaskName -ErrorAction SilentlyContinue
  Stop-ScheduledTask -TaskName $proxyTaskName -ErrorAction SilentlyContinue
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
  New-Item -ItemType Directory -Force -Path $caddyData | Out-Null
  $caddyFile = Join-Path $runtimeRoot "Caddyfile"
  @"
$origin {
  tls internal
  encode zstd gzip
  reverse_proxy 127.0.0.1:4310
}
"@ | Set-Content -LiteralPath $caddyFile -Encoding ASCII
  $previousXdgData = $env:XDG_DATA_HOME
  $previousXdgConfig = $env:XDG_CONFIG_HOME
  $previousAppData = $env:APPDATA
  $previousLocalAppData = $env:LOCALAPPDATA
  $previousHome = $env:HOME
  $env:XDG_DATA_HOME = $caddyData
  $env:XDG_CONFIG_HOME = $caddyData
  $env:APPDATA = $caddyData
  $env:LOCALAPPDATA = $caddyData
  $env:HOME = $caddyData
  try {
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $validationOutput = & $caddy validate --config $caddyFile --adapter caddyfile 2>&1
    $validationExitCode = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorPreference
    if ($validationExitCode -ne 0) {
      throw "Caddy configuration validation failed: $($validationOutput -join ' ')"
    }
  } finally {
    if ($previousErrorPreference) { $ErrorActionPreference = $previousErrorPreference }
    $env:XDG_DATA_HOME = $previousXdgData
    $env:XDG_CONFIG_HOME = $previousXdgConfig
    $env:APPDATA = $previousAppData
    $env:LOCALAPPDATA = $previousLocalAppData
    $env:HOME = $previousHome
  }
  $caddyRunner = Join-Path $runtimeRoot "Run-Caddy.ps1"
  $caddyLog = Join-Path $logRoot "caddy.log"
  "NetDenty HTTPS task preparation started at $(Get-Date -Format o)." |
    Set-Content -LiteralPath $caddyLog -Encoding ASCII
  @"
`$ErrorActionPreference = 'Stop'
`$env:XDG_DATA_HOME = '$($caddyData.Replace("'", "''"))'
`$env:XDG_CONFIG_HOME = '$($caddyData.Replace("'", "''"))'
`$env:APPDATA = '$($caddyData.Replace("'", "''"))'
`$env:LOCALAPPDATA = '$($caddyData.Replace("'", "''"))'
`$env:HOME = '$($caddyData.Replace("'", "''"))'
"Caddy runner started at `$([DateTime]::Now.ToString('o')) as `$([Security.Principal.WindowsIdentity]::GetCurrent().Name)." | Add-Content -LiteralPath '$($caddyLog.Replace("'", "''"))' -Encoding ASCII
try {
  # Caddy writes structured informational messages to stderr. Windows
  # PowerShell 5.1 must not promote those messages to terminating errors.
  `$ErrorActionPreference = 'Continue'
  & '$($caddy.Replace("'", "''"))' run --config '$($caddyFile.Replace("'", "''"))' --adapter caddyfile *>> '$($caddyLog.Replace("'", "''"))'
  `$result = `$LASTEXITCODE
  "Caddy exited with code `$result." | Add-Content -LiteralPath '$($caddyLog.Replace("'", "''"))' -Encoding ASCII
  exit `$result
} catch {
  "Caddy runner error: `$(`$_.Exception.Message)" | Add-Content -LiteralPath '$($caddyLog.Replace("'", "''"))' -Encoding ASCII
  exit 1
}
"@ | Set-Content -LiteralPath $caddyRunner -Encoding UTF8
  $windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $proxyAction = New-ScheduledTaskAction -Execute $windowsPowerShell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$caddyRunner`"" -WorkingDirectory $runtimeRoot
  Register-ScheduledTask -TaskName $proxyTaskName -Action $proxyAction -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  if (-not (Get-NetFirewallRule -DisplayName "NetDenty HTTPS" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "NetDenty HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Private,Domain | Out-Null
  }
  Start-ScheduledTask -TaskName $apiTaskName
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $proxyTaskName
  Start-Sleep -Seconds 3
  $proxyTask = Get-ScheduledTask -TaskName $proxyTaskName
  $proxyTaskInfo = Get-ScheduledTaskInfo -TaskName $proxyTaskName
  Write-Host "NetDenty HTTPS task state: $($proxyTask.State); result: $($proxyTaskInfo.LastTaskResult)."
  if ($proxyTask.State -ne "Running") {
    $startupLog = (Get-Content -LiteralPath $caddyLog -Tail 20 -ErrorAction SilentlyContinue) -join " | "
    throw "The NetDenty HTTPS task stopped during startup. Result: $($proxyTaskInfo.LastTaskResult). $startupLog"
  }

  $systemProfileCaddy = Join-Path $env:SystemRoot "System32\config\systemprofile\AppData\Roaming\Caddy"
  $certificateSearchRoots = @(
    $caddyData,
    $systemProfileCaddy,
    (Join-Path $env:SystemRoot "System32\config\systemprofile\AppData\Local\Caddy")
  ) | Select-Object -Unique
  $deadline = (Get-Date).AddSeconds(120)
  do {
    Start-Sleep -Seconds 1
    $rootCertificate = $certificateSearchRoots |
      Where-Object { Test-Path -LiteralPath $_ } |
      ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter "root.crt" -Recurse -ErrorAction SilentlyContinue } |
      Select-Object -First 1
  } until ($rootCertificate -or (Get-Date) -ge $deadline)
  if (-not $rootCertificate) {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $proxyTaskName -ErrorAction SilentlyContinue
    $logTail = if (Test-Path -LiteralPath $caddyLog) {
      (Get-Content -LiteralPath $caddyLog -Tail 20 -ErrorAction SilentlyContinue) -join " | "
    } else { "No Caddy log was created." }
    throw "HTTPS certificate creation did not complete. Caddy task result: $($taskInfo.LastTaskResult). $logTail"
  }
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
  Remove-Item -LiteralPath $postgresBootstrapSecret -Force -ErrorAction SilentlyContinue
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
  $dbPassword = $null
  $postgresSuperPassword = $null
  $existingDatabaseUrl = $null
  Remove-Item Env:NETDENTY_INSTALL_ADMIN_PASSWORD, Env:NETDENTY_INSTALL_CLINIC_NAME, Env:NETDENTY_INSTALL_POSTGRES_PASSWORD, Env:NETDENTY_INSTALL_NONINTERACTIVE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  if ($transcriptStarted) { try { Stop-Transcript | Out-Null } catch { } }
}
