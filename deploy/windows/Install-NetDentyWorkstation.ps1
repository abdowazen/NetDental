[CmdletBinding()]
param([switch]$NoElevation)

$ErrorActionPreference = "Stop"
function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal -ArgumentList $identity
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
if (-not $NoElevation -and -not (Test-Administrator)) {
  $process = Start-Process powershell.exe -Verb RunAs -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`"") -Wait -PassThru
  exit $process.ExitCode
}
if (-not (Test-Administrator)) { throw "Administrator permission is required." }

$connectionPath = Join-Path $PSScriptRoot "connection.json"
$certificatePath = Join-Path $PSScriptRoot "netdenty-root.crt"
$installerPath = Join-Path $PSScriptRoot "NetDenty-Workstation-Setup.exe"
foreach ($required in @($connectionPath, $certificatePath, $installerPath)) {
  if (-not (Test-Path -LiteralPath $required)) { throw "Missing installation file: $required" }
}
$connection = Get-Content -Raw -LiteralPath $connectionPath | ConvertFrom-Json
$uri = $null
if (-not [uri]::TryCreate([string]$connection.apiBaseUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -ne "https" -or $uri.PathAndQuery -ne "/") {
  throw "The workstation connection file does not contain a valid HTTPS server origin."
}

Import-Certificate -FilePath $certificatePath -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
$process = Start-Process -FilePath $installerPath -ArgumentList "/S" -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "NetDenty workstation installation failed with exit code $($process.ExitCode)." }
$configRoot = Join-Path $env:ProgramData "NetDenty"
New-Item -ItemType Directory -Force -Path $configRoot | Out-Null
@"
DESKTOP_MODE=REMOTE
API_BASE_URL=$($uri.GetLeftPart([UriPartial]::Authority))
"@ | Set-Content -LiteralPath (Join-Path $configRoot "desktop.env") -Encoding ASCII
& icacls.exe (Join-Path $configRoot "desktop.env") /inheritance:r /grant:r "SYSTEM:(F)" "Administrators:(F)" "Users:(R)" | Out-Null
try {
  $health = Invoke-RestMethod -Uri "$($uri.GetLeftPart([UriPartial]::Authority))/health" -TimeoutSec 10
  if ($health.status -ne "ok") { throw "Unexpected health response." }
} catch { throw "NetDenty was installed, but the clinic server could not be reached: $($_.Exception.Message)" }
Write-Host "NetDenty workstation installation completed successfully." -ForegroundColor Green
