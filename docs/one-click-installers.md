# NetDenty one-click Windows installers

For the complete clinic installation, update, pgAdmin, backup, and
troubleshooting procedure, see
[NetDenty installation, updates, database access, and troubleshooting](netdenty-operations-guide.md).

NetDenty produces two Windows installation packages:

- `NetDenty-Server-Setup.exe` installs the database, server API, HTTPS endpoint, administrator account, patient-file directory, migrations, and a local workstation.
- `NetDenty-Workstation-Setup-<version>.exe` is embedded into the server package. The server installer combines it with that clinic's server address and public root certificate to create the final **NetDenty Workstation Installer** folder.

The clinic computers do not require Node.js, npm, source code, pgAdmin, or direct PostgreSQL access.

> Do not distribute or run the obsolete `Dental Clinic Setup 0.1.0.exe`. That legacy package does not provision the database or server connection and will remain on the connection screen. Install the first clinic computer with `NetDenty-Server-Setup.exe`. Install additional computers from the **NetDenty Workstation Installer** folder generated on that server.

## Build computer preparation

Use a Windows x64 development computer with Node.js 22.12 or newer and the repository dependencies installed.

Download the official PostgreSQL 18 x64 Windows installer and the standard Caddy x64 executable. Follow [vendor/windows/README.md](../vendor/windows/README.md), record their SHA-256 values in `vendor/windows/manifest.json`, then run:

```powershell
npm ci
npm run typecheck
npm test
npm run installers
```

The build verifies both vendor hashes before including them. Successful output is written to `release`:

```text
NetDenty-Server-Setup.exe
NetDenty-Server-Installer.zip
NetDenty-Workstation-Setup-0.1.0.exe
```

Sign both EXE files with the publisher's Windows code-signing certificate before distribution. Keep the ZIP as a recovery alternative if a clinic's security policy blocks the NSIS package.

## Server installation

Run `NetDenty-Server-Setup.exe` as a Windows administrator on the protected, always-on clinic computer.

The first page asks for the clinic name and the initial `administrator`
password. Installation progress is then shown in the setup details window.

The installer performs these operations in order:

1. Copies the verified NetDenty runtime under `%ProgramData%\NetDenty\Server`.
2. Detects an existing PostgreSQL installation or silently installs the bundled PostgreSQL 18 server and command-line tools.
3. Generates separate random PostgreSQL administrator and application passwords.
4. Creates the restricted `clinic` role and `dental_clinic` database.
5. Writes the database credential only to the server-side API environment file and restricts its ACL to SYSTEM and Administrators.
6. Runs every Prisma migration from the packaged release.
7. Creates the first NetDenty administrator using the password entered during installation.
8. Renames the initial clinic using the installer value.
9. Registers the API and HTTPS proxy as SYSTEM startup tasks with automatic restart.
10. Opens inbound TCP 443 only for Private and Domain Windows Firewall profiles. PostgreSQL remains bound to loopback and is not exposed to workstations.
11. Creates a clinic-specific internal certificate and installs its root on the server.
12. Installs the workstation application locally and verifies the API health endpoint.
13. Creates a **NetDenty Workstation Installer** folder on the Public Desktop.

The public server address defaults to the Windows computer name, for example:

```text
https://CLINIC-SERVER
```

Clinic DNS or Windows name resolution must resolve that name from every workstation. Give the server a fixed private IP address or DHCP reservation before deployment.

## Workstation installation

Copy the complete **NetDenty Workstation Installer** folder from the server's Public Desktop to a workstation. Keep all five generated files together:

```text
Install-NetDentyWorkstation.cmd
Install-NetDentyWorkstation.ps1
NetDenty-Workstation-Setup.exe
connection.json
netdenty-root.crt
```

Right-click `Install-NetDentyWorkstation.cmd` and choose **Run as administrator**. The script:

1. Validates that `connection.json` contains an HTTPS origin.
2. Adds only this clinic server's root certificate to the Local Computer trusted-root store.
3. Silently installs NetDenty for all users.
4. Writes `%ProgramData%\NetDenty\desktop.env` with `DESKTOP_MODE=REMOTE` and the clinic API origin.
5. Restricts the configuration ACL and performs a live health check.

The workstation never receives `DATABASE_URL` or PostgreSQL credentials. It communicates only with the HTTPS API on port 443.

## Installed server locations

```text
%ProgramData%\NetDenty\Server\runtime       Application and server runtime
%ProgramData%\NetDenty\Server\data          Protected patient files and HTTPS state
%ProgramData%\NetDenty\Server\logs          Reserved operational logs
%ProgramData%\NetDenty\Server\Workstation Installer
%ProgramData%\NetDenty\desktop.env           Machine-wide workstation connection
```

The Windows startup tasks are named `NetDenty API` and `NetDenty HTTPS`.

## Recovering from an older failed PostgreSQL installation

An older server installer could resolve the x64 PostgreSQL folder through
`Program Files (x86)` and stop after PostgreSQL had already been installed. On
a new laptop with no data to preserve, uninstall that incomplete PostgreSQL 18
installation from Windows **Installed apps**, restart Windows, verify that no
`postgresql-netdenty` service remains, and then run the current server setup.
The current installer uses the native x64 program folder and retains a
protected temporary bootstrap credential so its own interrupted setup can be
retried safely.

## Upgrade behavior

Rebuilding and running a newer server installer replaces application runtime files, preserves `%ProgramData%\NetDenty\Server\data`, and reapplies only pending Prisma migrations. Create and verify a database and patient-file backup before every upgrade.

When the configured administrator already exists, an upgrade preserves that account and password. Pending database migrations are applied before the startup tasks are replaced.

## Production release checks

Before delivering a package to a clinic:

- Test the exact signed installer on a clean Windows x64 virtual machine.
- Test a server restart and confirm both scheduled tasks recover automatically.
- Install on a separate workstation and verify login, patient file upload, treatment, payment, backup, and restore.
- Confirm Windows Firewall exposes 443 and does not expose PostgreSQL 5432.
- Confirm the server certificate is trusted only after running the generated workstation installer.
- Confirm database credentials do not exist on a workstation.
- Create an off-computer backup of both PostgreSQL and the patient-file directory.

PostgreSQL's official Windows page states that its installer supports silent mode and that its binary archive is intended for inclusion with other application installers: [PostgreSQL Windows installers](https://www.postgresql.org/download/windows/). The unattended parameters used by NetDenty are documented by [EDB](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/command_line_parameters/).
