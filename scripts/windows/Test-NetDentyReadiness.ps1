[CmdletBinding()]
param(
  [string]$InstallRoot = "$env:ProgramData\NetDenty\Server",
  [switch]$WorkstationOnly
)

# Read-only checks; compatible with Windows PowerShell 5.1. Never print secrets.
$ErrorActionPreference = 'Stop'
$script:failed = 0
function Check([string]$Name, [scriptblock]$Action, [string]$Hint) {
  try {
    $detail = & $Action
    Write-Output "[PASS] ${Name}: $detail"
  } catch {
    $script:failed++
    # Do not print arbitrary exceptions: configuration or database errors can contain secrets.
    Write-Output "[FAIL] ${Name}: $Hint"
  }
}
function Read-Environment([string]$Path) {
  $values = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^\s*([^#=\s]+)=(.*)$') {
      $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}
function Test-Health([string]$Origin) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $result = Invoke-RestMethod -Uri "$Origin/health" -TimeoutSec 10 -MaximumRedirection 0
  if ($result.status -ne 'ok') { throw 'Unhealthy' }
  $watch.Stop()
  return "API and database OK ($($watch.ElapsedMilliseconds) ms); desktop allows 1500 ms per health attempt"
}

Write-Output "NetDenty readiness - $(Get-Date -Format o) - $env:COMPUTERNAME"
$api = @{}
if (-not $WorkstationOnly) {
  Check 'API configuration' {
    $script:api = Read-Environment (Join-Path $InstallRoot 'runtime\api\.env')
    if (-not $api.DATABASE_URL) { throw 'Missing database URL' }
    'Installed .env readable; DATABASE_URL present (hidden)'
  } 'Run as administrator on the server; verify runtime\api\.env exists and has DATABASE_URL.'
  foreach ($relative in @('node.exe', 'api\server.mjs', 'web\index.html', 'caddy.exe', 'Caddyfile')) {
    Check "Runtime $relative" {
      if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot "runtime\$relative") -PathType Leaf)) { throw 'Missing file' }
      'File exists'
    } 'Installed runtime is incomplete; repair using the complete server installer.'
  }
  Check 'Node server process' {
    $entry = Join-Path $InstallRoot 'runtime\api\server.mjs'
    $node = Join-Path $InstallRoot 'runtime\node.exe'
    $running = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
      $_.ExecutablePath -eq $node -and $_.CommandLine -like "*$entry*"
    })
    if (-not $running.Count) { throw 'Not running' }
    "Installed node.exe is running server.mjs; PID $($running.ProcessId -join ', ')"
  } 'No matching installed node.exe/server.mjs process visible. Check the API task; run as administrator.'
  foreach ($taskName in @('NetDenty API', 'NetDenty HTTPS')) {
    Check $taskName {
      $task = Get-ScheduledTask -TaskName $taskName
      $info = Get-ScheduledTaskInfo -TaskName $taskName
      if ($task.State -ne 'Running') { throw 'Task stopped' }
      "Running; last task result $($info.LastTaskResult) (267009 means still running)"
    } 'Task missing or stopped. Inspect Task Scheduler action, working directory, and last result; see guide section 10.'
  }
  Check 'PostgreSQL service' {
    $services = @(Get-Service -Name 'postgresql*' | Where-Object Status -eq 'Running')
    if (-not $services.Count) { throw 'Stopped' }
    $services.Name -join ', '
  } 'No running PostgreSQL service found. Check the installed PostgreSQL service.'
  Check 'Database authenticated SELECT 1' {
    $uri = [Uri]$api.DATABASE_URL
    $credentials = $uri.UserInfo.Split(':', 2)
    if ($uri.Scheme -notin @('postgres', 'postgresql') -or $credentials.Count -ne 2) { throw 'Invalid URL' }
    $psql = Join-Path $api.POSTGRES_BIN 'psql.exe'
    if (-not (Test-Path -LiteralPath $psql)) { throw 'Missing psql' }
    $oldPassword = $env:PGPASSWORD
    $oldTimeout = $env:PGCONNECT_TIMEOUT
    try {
      $env:PGPASSWORD = [Uri]::UnescapeDataString($credentials[1])
      $env:PGCONNECT_TIMEOUT = '5'
      $port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
      $answer = & $psql -X -w -h $uri.Host -p $port -U ([Uri]::UnescapeDataString($credentials[0])) -d ([Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))) -v ON_ERROR_STOP=1 -At -c 'SELECT 1;' 2>$null
      if ($LASTEXITCODE -ne 0 -or ($answer -join '').Trim() -ne '1') { throw 'Query failed' }
      'Authenticated using installed API credentials; query succeeded'
    } finally {
      $env:PGPASSWORD = $oldPassword
      $env:PGCONNECT_TIMEOUT = $oldTimeout
    }
  } 'Check POSTGRES_BIN/psql.exe and the installed DATABASE_URL host, port, database, and credentials. Values are hidden.'
  Check 'Local API health' {
    $port = if ($api.PORT) { [int]$api.PORT } else { 4310 }
    Test-Health "http://127.0.0.1:$port"
  } 'API request failed, timed out, or database health failed. Check API process, configured port, and database result above.'
}

$script:origin = $null
Check 'Desktop connection configuration' {
  $machine = Join-Path $env:ProgramData 'NetDenty\desktop.env'
  $user = Join-Path $env:APPDATA 'Dental Clinic\desktop.env'
  $path = if (Test-Path -LiteralPath $machine) { $machine } else { $user }
  $desktop = Read-Environment $path
  $uri = [Uri]$desktop.API_BASE_URL
  if ($desktop.DESKTOP_MODE -ne 'REMOTE' -or -not $uri.IsAbsoluteUri -or
      $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
    throw 'Invalid installed desktop settings'
  }
  $script:origin = $uri.GetLeftPart([UriPartial]::Authority)
  "REMOTE HTTPS configuration valid in $path"
} 'Expected DESKTOP_MODE=REMOTE and API_BASE_URL=https://SERVER with no path/query. Machine desktop.env takes precedence over the user file. Rerun workstation kit.'
Check 'Configured server DNS' {
  if (-not $origin) { throw 'No origin' }
  $addresses = [Net.Dns]::GetHostAddresses(([Uri]$origin).Host)
  if (-not $addresses.Count) { throw 'No addresses' }
  ($addresses.IPAddressToString -join ', ')
} 'Check configured server name and clinic DNS. On a separate workstation the address must be the server LAN IP, not loopback.'
Check 'Configured HTTPS health and certificate trust' {
  if (-not $origin) { throw 'No origin' }
  Test-Health $origin
} 'Check DNS, port 443/firewall, Caddy, trusted clinic root certificate, and database. TLS verification is enabled.'
Check 'Configured application page' {
  if (-not $origin) { throw 'No origin' }
  $page = Invoke-WebRequest -UseBasicParsing -Uri "$origin/" -TimeoutSec 10 -MaximumRedirection 0
  if ($page.StatusCode -ne 200 -or $page.Content -notmatch '<html' -or $page.Content -notmatch '<script') { throw 'Missing web app' }
  'HTML application shell returned (JavaScript execution/login rendering not tested)'
} 'Health can pass while web files are missing. Check WEB_DIST, runtime\web and complete release installation.'

Write-Output "Completed: $script:failed failed check(s). No services, tasks, certificates, or data were changed."
if ($script:failed) { exit 1 }
exit 0
