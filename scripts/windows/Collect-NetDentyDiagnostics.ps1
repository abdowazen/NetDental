[CmdletBinding()]
param(
  [string]$InstallRoot = "$env:ProgramData\NetDenty\Server",
  [string]$OutputDirectory = ([Environment]::GetFolderPath("Desktop"))
)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$work = Join-Path $env:TEMP "NetDenty-diagnostics-$stamp"
$report = Join-Path $work "diagnostics.txt"
New-Item -ItemType Directory -Force -Path $work | Out-Null

function Add-Section([string]$Title, [scriptblock]$Command) {
  "`r`n===== $Title =====" | Add-Content -LiteralPath $report -Encoding UTF8
  try { (& $Command 2>&1 | Out-String).TrimEnd() | Add-Content -LiteralPath $report -Encoding UTF8 }
  catch { "ERROR: $($_.Exception.Message)" | Add-Content -LiteralPath $report -Encoding UTF8 }
}

"NetDenty diagnostics collected at $(Get-Date -Format o)" | Set-Content -LiteralPath $report -Encoding UTF8
"Computer: $env:COMPUTERNAME" | Add-Content -LiteralPath $report -Encoding UTF8
"Windows: $([Environment]::OSVersion.VersionString)" | Add-Content -LiteralPath $report -Encoding UTF8

Add-Section "Disk space" { Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free }
Add-Section "NetDenty scheduled tasks" {
  foreach ($name in @("NetDenty API", "NetDenty HTTPS")) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    $info = Get-ScheduledTaskInfo -TaskName $name -ErrorAction SilentlyContinue
    [pscustomobject]@{ Name = $name; State = $task.State; LastResult = $info.LastTaskResult; LastRun = $info.LastRunTime }
  }
}
Add-Section "PostgreSQL services" { Get-Service -Name "postgresql*" | Select-Object Name, Status, StartType }
Add-Section "Listening ports" {
  Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in @(443, 4310, 5432) } |
    Select-Object LocalAddress, LocalPort, OwningProcess
}
Add-Section "Server name resolution" { Resolve-DnsName $env:COMPUTERNAME }
Add-Section "Local API health" { Invoke-RestMethod -Uri "http://127.0.0.1:4310/health" -TimeoutSec 10 }
Add-Section "HTTPS health" { Invoke-RestMethod -Uri "https://$env:COMPUTERNAME/health" -TimeoutSec 10 }
Add-Section "Firewall rule" { Get-NetFirewallRule -DisplayName "NetDenty HTTPS" | Select-Object DisplayName, Enabled, Profile, Direction, Action }
Add-Section "Trusted NetDenty and Caddy certificates" {
  Get-ChildItem Cert:\LocalMachine\Root |
    Where-Object { $_.Subject -match "Caddy|NetDenty" -or $_.Issuer -match "Caddy|NetDenty" } |
    Select-Object Subject, Issuer, Thumbprint, NotBefore, NotAfter
}
Add-Section "Machine workstation configuration" {
  Get-Content -LiteralPath "$env:ProgramData\NetDenty\desktop.env" -ErrorAction Stop
}
Add-Section "Installed paths" {
  @(
    "$InstallRoot\runtime\api\server.mjs",
    "$InstallRoot\runtime\web\index.html",
    "$InstallRoot\runtime\Caddyfile",
    "$InstallRoot\data\patient-files",
    "$InstallRoot\Workstation Installer"
  ) | ForEach-Object { [pscustomobject]@{ Path = $_; Exists = Test-Path -LiteralPath $_ } }
}

$apiEnvironment = Join-Path $InstallRoot "runtime\api\.env"
Add-Section "API configuration keys (values redacted)" {
  Get-Content -LiteralPath $apiEnvironment -ErrorAction Stop |
    Where-Object { $_ -match "^[^#=]+=" } |
    ForEach-Object { ($_.Split("=", 2)[0]) + "=<redacted>" }
}

foreach ($logName in @("install.log", "caddy.log")) {
  $source = Join-Path $InstallRoot "logs\$logName"
  if (Test-Path -LiteralPath $source) {
    Get-Content -LiteralPath $source -Tail 500 -ErrorAction SilentlyContinue |
      Set-Content -LiteralPath (Join-Path $work $logName) -Encoding UTF8
  }
}

$zip = Join-Path $OutputDirectory "NetDenty-diagnostics-$stamp.zip"
Compress-Archive -Path (Join-Path $work "*") -DestinationPath $zip -Force
Remove-Item -LiteralPath $work -Recurse -Force
Write-Host "Diagnostics created at:" -ForegroundColor Green
Write-Host $zip

