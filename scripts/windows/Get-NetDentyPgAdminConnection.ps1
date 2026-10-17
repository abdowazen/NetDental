[CmdletBinding()]
param(
  [string]$EnvironmentFile = "$env:ProgramData\NetDenty\Server\runtime\api\.env",
  [switch]$ShowPassword
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
  throw "NetDenty API environment file was not found at $EnvironmentFile. Run this script on the server laptop as an administrator."
}

$databaseLine = Get-Content -LiteralPath $EnvironmentFile |
  Where-Object { $_ -like "DATABASE_URL=*" } |
  Select-Object -First 1

if (-not $databaseLine) {
  throw "DATABASE_URL was not found in the NetDenty API environment file."
}

$databaseUri = $null
$rawUrl = $databaseLine.Substring("DATABASE_URL=".Length)
if (-not [Uri]::TryCreate($rawUrl, [UriKind]::Absolute, [ref]$databaseUri)) {
  throw "The installed NetDenty database URL is invalid."
}

$credentials = $databaseUri.UserInfo.Split(":", 2)
if ($credentials.Count -ne 2) {
  throw "The installed NetDenty database credentials are incomplete."
}

$password = [Uri]::UnescapeDataString($credentials[1])
$database = $databaseUri.AbsolutePath.TrimStart("/")
$result = [ordered]@{
  Name = "NetDenty Local"
  Host = $databaseUri.Host
  Port = $databaseUri.Port
  MaintenanceDatabase = $database
  Username = [Uri]::UnescapeDataString($credentials[0])
  Password = if ($ShowPassword) { $password } else { "Run again with -ShowPassword" }
  SslMode = "Prefer"
}

[pscustomobject]$result | Format-List

