[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [string]$InstallRoot = "$env:ProgramData\NetDenty\Server"
)

$ErrorActionPreference = "Stop"
$environmentFile = Join-Path $InstallRoot "runtime\api\.env"
if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw "NetDenty API environment file was not found at $environmentFile."
}

$values = @{}
Get-Content -LiteralPath $environmentFile | ForEach-Object {
  if ($_ -match "^([^#=]+)=(.*)$") { $values[$matches[1]] = $matches[2] }
}
if (-not $values.DATABASE_URL) { throw "DATABASE_URL is missing from the installed API environment file." }

$databaseUri = [Uri]$values.DATABASE_URL
$credentials = $databaseUri.UserInfo.Split(":", 2)
if ($credentials.Count -ne 2) { throw "The database credentials are incomplete." }
$databaseUser = [Uri]::UnescapeDataString($credentials[0])
$databasePassword = [Uri]::UnescapeDataString($credentials[1])
$databaseName = $databaseUri.AbsolutePath.TrimStart("/")

$postgresBin = $values.POSTGRES_BIN
$pgDump = if ($postgresBin) { Join-Path $postgresBin "pg_dump.exe" } else { $null }
if (-not $pgDump -or -not (Test-Path -LiteralPath $pgDump)) {
  $pgDump = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $pgDump -or -not (Test-Path -LiteralPath $pgDump)) {
  throw "pg_dump.exe was not found. Verify that PostgreSQL command-line tools are installed."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path ([IO.Path]::GetFullPath($Destination)) "NetDenty-pre-update-$stamp"
$patientSource = if ($values.PATIENT_FILES_DIR) { $values.PATIENT_FILES_DIR } else { Join-Path $InstallRoot "data\patient-files" }
$databaseBackup = Join-Path $backupRoot "dental_clinic.dump"
$patientBackup = Join-Path $backupRoot "patient-files"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $databasePassword
  & $pgDump -Fc -h $databaseUri.Host -p $databaseUri.Port -U $databaseUser -d $databaseName -f $databaseBackup
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL backup failed with exit code $LASTEXITCODE." }
} finally {
  $env:PGPASSWORD = $previousPassword
}

if (-not (Test-Path -LiteralPath $databaseBackup) -or (Get-Item -LiteralPath $databaseBackup).Length -eq 0) {
  throw "The database backup file was not created correctly."
}

if (Test-Path -LiteralPath $patientSource) {
  New-Item -ItemType Directory -Force -Path $patientBackup | Out-Null
  Get-ChildItem -LiteralPath $patientSource -Force |
    Copy-Item -Destination $patientBackup -Recurse -Force -ErrorAction Stop
}

@"
Created: $(Get-Date -Format o)
Database: $databaseName
Database archive: dental_clinic.dump
Patient files included: $(Test-Path -LiteralPath $patientSource)
"@ | Set-Content -LiteralPath (Join-Path $backupRoot "backup-manifest.txt") -Encoding UTF8

Write-Host "Verified pre-update backup created at:" -ForegroundColor Green
Write-Host $backupRoot
