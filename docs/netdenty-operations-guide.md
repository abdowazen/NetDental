# NetDenty installation, updates, database access, and troubleshooting

This guide is for the person who installs and supports NetDenty on a clinic's
Windows computers. It covers the server laptop, additional workstations,
pgAdmin access, backups, release updates, and installation diagnostics.

## 1. Understand the installation

NetDenty has two installation roles:

- The **server laptop** runs PostgreSQL, the NetDenty API, HTTPS, patient-file
  storage, and a local copy of the desktop application. It should remain on
  while clinic workstations use NetDenty.
- A **workstation** runs only the NetDenty desktop application. It connects to
  the server through HTTPS and never receives PostgreSQL credentials.

The installers are:

```text
NetDenty-Server-Setup.exe
NetDenty-Workstation-Setup-<version>.exe
```

Do not use the old `Dental Clinic Setup 0.1.0.exe` package.

## 2. Prepare the server laptop

1. Use a supported 64-bit Windows 10 or Windows 11 computer.
2. Install all Windows updates and restart it.
3. Sign in using an account with Windows administrator permission.
4. Keep at least 6 GB of free disk space for installation, plus sufficient
   space for patient files and backups.
5. Set the clinic network profile to **Private**.
6. Give the server a fixed private IP address or create a DHCP reservation in
   the router. The Windows computer name does not need to be changed.
7. Keep the laptop connected to power and disable automatic sleep while it is
   serving other workstations.
8. Keep the NetDenty server installer and a backup copy on protected storage.

PostgreSQL does not need to be installed manually. The server installer uses
an existing supported PostgreSQL installation or installs its bundled copy.
pgAdmin 4 is optional and may be installed separately on the server laptop.

## 3. Install the server

1. Copy `NetDenty-Server-Setup.exe` to the server laptop.
2. Right-click it and select **Run as administrator**.
3. Enter the clinic name.
4. Enter a strong NetDenty administrator password containing 12-128
   characters. Store it in the clinic's protected password record.
5. Let the setup finish without closing its PowerShell or setup window.
6. Open NetDenty from the desktop shortcut.
7. Sign in with:

   ```text
   Username: administrator
   Password: the password entered during server setup
   ```

The NetDenty login password is different from the generated PostgreSQL
database password.

The installer creates:

```text
C:\ProgramData\NetDenty\Server\runtime
C:\ProgramData\NetDenty\Server\data
C:\ProgramData\NetDenty\Server\logs
C:\ProgramData\NetDenty\Server\Workstation Installer
C:\ProgramData\NetDenty\desktop.env
```

It also creates the startup tasks `NetDenty API` and `NetDenty HTTPS` and a
**NetDenty Workstation Installer** folder on the Public Desktop.

## 4. Verify the server installation

Open PowerShell as administrator and run:

```powershell
Get-Service -Name "postgresql*" | Select-Object Name, Status, StartType

Get-ScheduledTask -TaskName "NetDenty API", "NetDenty HTTPS" |
  Select-Object TaskName, State

Get-ScheduledTaskInfo -TaskName "NetDenty API"
Get-ScheduledTaskInfo -TaskName "NetDenty HTTPS"

Invoke-RestMethod http://127.0.0.1:4310/health
Invoke-RestMethod "https://$env:COMPUTERNAME/health"
```

Both health requests must return a response whose status is `ok`. Restart the
server laptop once and repeat the checks to confirm automatic startup.

## 5. Perform the initial clinic configuration

Configure the system in this order:

1. General settings, clinic details, language, and appearance.
2. Base currency and exchange rates.
3. Surgical rooms.
4. User accounts, room assignments, and screen permissions.
5. Procedure categories and procedures.
6. Laboratories and laboratory procedure rates.
7. Bill categories.
8. Suppliers, brands, and inventory materials.
9. Create a test patient and verify appointment, treatment, payment,
   laboratory, inventory, history, and analytics workflows.
10. Create and verify the first backup.

## 6. Install an additional workstation

On the server, locate the complete **NetDenty Workstation Installer** folder.
Keep these five files together:

```text
Install-NetDentyWorkstation.cmd
Install-NetDentyWorkstation.ps1
NetDenty-Workstation-Setup.exe
connection.json
netdenty-root.crt
```

Then:

1. Copy the complete folder to the workstation using an encrypted USB drive or
   protected local network location.
2. Confirm the workstation is connected to the same clinic network.
3. Right-click `Install-NetDentyWorkstation.cmd` and select **Run as
   administrator**. Do not run only the EXE because the script also installs
   the clinic certificate and server address.
4. Open NetDenty and sign in using a NetDenty account created by the
   administrator.
5. Test connectivity from the workstation:

   ```powershell
   Get-Content "$env:ProgramData\NetDenty\desktop.env"
   Resolve-DnsName CLINIC-SERVER
   Test-NetConnection CLINIC-SERVER -Port 443
   Invoke-RestMethod https://CLINIC-SERVER/health
   ```

Replace `CLINIC-SERVER` with the server name stored in `desktop.env`.

## 7. Connect pgAdmin 4

Run pgAdmin only on the server laptop. PostgreSQL listens on loopback and is
intentionally unavailable directly from clinic workstations.

From a copy of the project support scripts, open PowerShell as administrator
and run:

```powershell
.\scripts\windows\Get-NetDentyPgAdminConnection.ps1 -ShowPassword
```

Alternatively, retrieve the values directly:

```powershell
$line = Get-Content "C:\ProgramData\NetDenty\Server\runtime\api\.env" |
  Where-Object { $_ -like "DATABASE_URL=*" }
$uri = [Uri]$line.Substring("DATABASE_URL=".Length)
$parts = $uri.UserInfo.Split(":", 2)
[pscustomobject]@{
  Host = $uri.Host
  Port = $uri.Port
  Database = $uri.AbsolutePath.TrimStart("/")
  Username = [Uri]::UnescapeDataString($parts[0])
  Password = [Uri]::UnescapeDataString($parts[1])
} | Format-List
```

Register the server in pgAdmin with:

```text
Name: NetDenty Local
Host: 127.0.0.1
Port: 5432
Maintenance database: dental_clinic
Username: clinic
Password: value returned by the script
SSL mode: Prefer
```

Tables are under **Databases → dental_clinic → Schemas → public → Tables**.
Use pgAdmin for inspection, controlled backups, and reviewed maintenance.
Editing rows manually bypasses NetDenty validation and audit behavior.

## 8. Back up before every update

In NetDenty, open **Settings → Backup & Restore** and create a database backup
on an external disk. Patient files are stored outside PostgreSQL, so preserve
them as well.

The support script creates both backups without displaying the database
password:

```powershell
.\scripts\windows\Backup-NetDentyBeforeUpdate.ps1 `
  -Destination "E:\NetDentyBackups"
```

Confirm that the resulting folder contains a nonempty `dental_clinic.dump`, a
`patient-files` folder, and `backup-manifest.txt`. Keep one backup off the
server laptop. Do not begin an update until the backup is verified.

## 9. Decide which update procedure to use

### 9.1 Application change without a database schema change

Examples include layout changes, validation fixes, report formatting, API
logic that uses the current schema, and Electron connection fixes.

On the development computer:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run installers
```

Increase the application version before producing a formal release. Sign both
EXE files and record their SHA-256 hashes:

```powershell
Get-FileHash .\release\NetDenty-Server-Setup.exe -Algorithm SHA256
Get-FileHash .\release\NetDenty-Workstation-Setup-*.exe -Algorithm SHA256
```

On the clinic server:

1. Create and verify the pre-update backup.
2. Close NetDenty on every workstation.
3. Run the newer server installer as administrator. It replaces runtime files,
   preserves clinic data and patient files, and finds no pending migration.
4. Verify both health endpoints and log in.
5. Use the newly generated workstation kit to update each workstation when the
   desktop package changed. For release consistency, updating every workstation
   is recommended.
6. Run the booking-to-treatment-to-payment smoke workflow.

Do not copy individual JavaScript files into `ProgramData`; a partial runtime
can mix incompatible release files.

### 9.2 Database schema change without a visible application change

Examples include a new index, constraint, relation, or column needed for later
work. Create a Prisma migration in development and review its SQL:

```powershell
npx prisma migrate dev --name descriptive_change `
  --schema apps/api/prisma/schema.prisma
```

Test the migration against both a clean database and a copy of an existing
clinic database. Then build a complete server release. On the clinic server:

1. Create and verify the database and patient-file backup.
2. Close all workstations.
3. Run the signed server release as administrator.
4. The installer runs `prisma migrate deploy`, which applies only pending
   migration folders.
5. Verify health, login, affected data, and the migration table.

Do not run `prisma migrate dev`, `db push`, or handwritten `ALTER TABLE`
commands against the clinic production database. Workstations do not need an
update when the desktop and web applications truly did not change.

### 9.3 Application and database change together

Use one versioned release containing the application and its Prisma migration.
The order is:

1. Test an upgrade using a restored copy of real clinic data.
2. Create and verify the production backup.
3. Stop user activity.
4. Run the newer server installer.
5. Verify migrations and server health.
6. Update all workstation installations from the newly generated kit.
7. Test login and the business workflow affected by the change.
8. Keep the previous installer and backup until the new release is accepted.

### 9.4 Data correction without a schema change

Prefer an application/API correction tool that validates the operation and
records who performed it. If a reviewed SQL correction is unavoidable, back up
first and execute it inside a transaction in pgAdmin:

```sql
BEGIN;

-- Reviewed correction statement goes here.

-- Inspect the affected records before committing.
-- COMMIT;
ROLLBACK;
```

Replace `ROLLBACK` with `COMMIT` only after validating the exact affected rows.
Never use a generic production data-fix script without clinic-specific review.

## 10. Troubleshoot an installation

Start with the diagnostic collector. It records tasks, services, listening
ports, health checks, certificates, configuration keys with values redacted,
and recent installer/Caddy logs:

```powershell
.\scripts\windows\Collect-NetDentyDiagnostics.ps1
```

It creates `NetDenty-diagnostics-<date>.zip` on the desktop. The script does
not include `DATABASE_URL` or passwords. Review the ZIP before sending it.

### Installer stopped or returned an exit code

Read:

```powershell
Get-Content "C:\ProgramData\NetDenty\Server\logs\install.log" -Tail 200
```

Check free space and confirm the installer was run as administrator. Avoid
starting a second setup while the first one is still installing PostgreSQL.

### PostgreSQL unavailable

```powershell
Get-Service -Name "postgresql*"
Start-Service -Name "postgresql-netdenty"
Test-NetConnection 127.0.0.1 -Port 5432
```

If the installed service has a different name, use the name returned by
`Get-Service`. Do not uninstall PostgreSQL when clinic data already exists.

### API task is stopped

```powershell
Start-ScheduledTask -TaskName "NetDenty API"
Start-Sleep -Seconds 3
Get-ScheduledTaskInfo -TaskName "NetDenty API"
Invoke-RestMethod http://127.0.0.1:4310/health
```

Confirm that `C:\ProgramData\NetDenty\Server\runtime\api\server.mjs` and its
protected `.env` file exist.

### HTTPS task is stopped or Caddy failed

```powershell
Get-Content "C:\ProgramData\NetDenty\Server\logs\caddy.log" -Tail 200
Start-ScheduledTask -TaskName "NetDenty HTTPS"
Test-NetConnection 127.0.0.1 -Port 443
Invoke-RestMethod "https://$env:COMPUTERNAME/health"
```

Caddy writes informational JSON to its log; an `info` line by itself is not a
failure. Look for an exit code or an `error` entry.

### Workstation says the clinic server cannot be reached

On the workstation:

```powershell
Get-Content "$env:ProgramData\NetDenty\desktop.env"
Resolve-DnsName CLINIC-SERVER
Test-NetConnection CLINIC-SERVER -Port 443
Invoke-RestMethod https://CLINIC-SERVER/health
```

Interpret the result:

- Name resolution failure: correct local DNS/router resolution or add a
  controlled hosts entry mapping the server's fixed private IP to its name.
- Port 443 failure: verify the server is on, the network is Private, the HTTPS
  task is running, and the `NetDenty HTTPS` firewall rule is enabled.
- Certificate error: rerun the complete workstation installer folder as
  administrator so `netdenty-root.crt` is installed.
- HTTPS health works but the app does not: reinstall the current workstation
  EXE from the complete kit and confirm `desktop.env` points to the same HTTPS
  origin.

On the server laptop, `RemoteAddress: ::1` is normal because the computer name
can resolve to its own IPv6 loopback. On a separate workstation, the resolved
address must be the server's LAN address, not `127.0.0.1` or `::1`.

### pgAdmin cannot connect

Confirm pgAdmin is running on the server laptop and use `127.0.0.1`, port
`5432`, database `dental_clinic`, and user `clinic`. Retrieve the current
generated password again rather than using the NetDenty login password.

### Login is rejected

The initial username is `administrator`. Its password is the value entered in
the server setup, not the PostgreSQL password. Password hashes cannot be
converted back to the original password; a forgotten password must be reset by
an authorized administrator process.

### Interface text is too small

Keep the monitor at its recommended resolution and increase Windows
**Settings → System → Display → Scale** to 125%, 150%, or the value recommended
for that display. Restart NetDenty after changing the scale.

## 11. Information to record for support

For every installation or upgrade, record:

- Clinic name and server Windows computer name.
- Server fixed private IP or DHCP reservation.
- NetDenty release version and installer SHA-256.
- Installation or upgrade date.
- Backup location and verification result.
- `NetDenty API` and `NetDenty HTTPS` task results.
- Local HTTP and HTTPS health-check results.
- Workstations updated and tested.
- Diagnostic ZIP when an error occurs.

Never put database passwords, administrator passwords, patient exports, or an
unredacted API `.env` file in an email or ordinary support ticket.

