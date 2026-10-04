# NetDenty Windows installation guide

This guide describes how to install NetDenty, PostgreSQL, the database schema, and the required configuration on a Windows client. It also explains the supported layout for several clinic laptops.

## 1. Choose the deployment layout

Choose one layout before installing anything.

### Standalone installation

Use this layout when one Windows laptop will contain everything:

- NetDenty desktop application
- Bundled NetDenty API
- PostgreSQL service
- Clinic database
- Patient file storage

Set `DESKTOP_MODE=LOCAL`. The application and database remain usable without internet access.

### Shared installation for several laptops

Use this layout when several workstations must share patients, treatments, payments, inventory, and settings:

- One protected, always-on server or designated clinic computer runs PostgreSQL and the NetDenty API.
- Every clinic laptop installs only the NetDenty desktop application.
- Client laptops use `DESKTOP_MODE=REMOTE` and connect to the same HTTPS API.
- Database credentials exist only on the server. Never copy `DATABASE_URL` to remote client laptops.

Do not install separate LOCAL databases on several laptops if they must share data. Each LOCAL database is independent and will not synchronize automatically.

## 2. Files needed for deployment

Prepare these files on the deployment administrator's computer:

1. The current NetDenty source/deployment checkout, including `package-lock.json` and `apps/api/prisma/migrations`.
2. The generated Windows installer from the `release` directory.
3. A securely stored database password.
4. A backup destination that is not on the same physical disk as the clinic database.

The deployment checkout is required for database migrations and administrator provisioning. Ordinary clinic users do not need the source code or Node.js after installation.

## 3. Build the Windows installer

Perform this section on the deployment or development computer, not on every clinic laptop.

### Prerequisites

- Windows x64
- Node.js 22.12 or newer supported LTS
- npm
- Internet access while installing dependencies and staging the production runtime

Open PowerShell in the repository root:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm run desktop:package
```

The NSIS installer is written under:

```text
release\
```

The unpacked application, when generated with `npm run desktop:unpacked`, is:

```text
release\win-unpacked\NetDenty.exe
```

The current installer is unsigned. Windows SmartScreen may therefore display an unknown-publisher warning. Sign production installers with your organization’s Windows code-signing certificate before distributing them to clients.

## 4. Install PostgreSQL on a standalone client

Skip this section on REMOTE client laptops. Complete it only on the standalone laptop or central server.

1. Download and install PostgreSQL 17 or 18 x64 from the official PostgreSQL Windows distribution.
2. Keep the PostgreSQL service enabled for automatic Windows startup.
3. Record the password chosen for the PostgreSQL `postgres` administrator account.
4. PostgreSQL may install pgAdmin, but pgAdmin is optional. NetDenty does not require it.
5. For a standalone laptop, keep PostgreSQL bound to loopback and do not expose port `5432` through Windows Firewall.

Verify the service:

```powershell
Get-Service postgresql*
Test-NetConnection 127.0.0.1 -Port 5432
```

The PostgreSQL service should be `Running`, and the port test should succeed.

## 5. Create the PostgreSQL role and database

SQL commands must run inside `psql` or pgAdmin Query Tool. Do not type `CREATE DATABASE` directly into Command Prompt or PowerShell.

Open `psql` as the PostgreSQL administrator. Adjust `18` if a different PostgreSQL version is installed:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d postgres
```

Enter the `postgres` password when prompted. At the `postgres=#` prompt, run:

```sql
CREATE ROLE clinic LOGIN;
\password clinic
CREATE DATABASE dental_clinic OWNER clinic;
\q
```

The `\password clinic` command prompts for the new password without placing it in PowerShell history.

The database must be created by `postgres` or another PostgreSQL administrator. The `clinic` role does not require permission to create databases after installation.

Test the new login:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U clinic -h 127.0.0.1 -d dental_clinic -c "SELECT current_database(), current_user;"
```

## 6. Prepare the deployment environment

Install Node.js 22.12 or newer on the machine where migrations and account provisioning will run. Copy the deployment checkout to a protected directory such as:

```text
C:\NetDenty-Deployment
```

Open PowerShell in that directory:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` and set a real password:

```dotenv
DATABASE_URL=postgresql://clinic:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/dental_clinic?schema=public
HOST=127.0.0.1
PORT=4310
APP_ORIGIN=http://127.0.0.1:4310
COOKIE_SECURE=false
SESSION_HOURS=12
DESKTOP_MODE=LOCAL
API_BASE_URL=http://127.0.0.1:4310
```

Keep `.env` private and never commit it. If the password contains characters such as `@`, `:`, `/`, `?`, `#`, or `%`, percent-encode the password in `DATABASE_URL`.

## 7. Install the database schema

Do not create NetDenty tables manually. Prisma migrations create the complete schema in the correct order.

From the deployment checkout:

```powershell
npm run db:generate
npm run db:migrate
```

A successful migration ends with:

```text
All migrations have been successfully applied.
```

Migrations are explicit deployment operations. The desktop application does not run migrations automatically.

### How tables and database structure are added

NetDenty uses Prisma to manage the PostgreSQL structure:

1. `apps/api/prisma/schema.prisma` describes the application models, fields, relationships, indexes, unique constraints, and PostgreSQL data types.
2. Each versioned directory under `apps/api/prisma/migrations` contains a `migration.sql` file with the actual PostgreSQL commands.
3. `npm run db:migrate` executes all migration files that have not yet been applied, in version order.
4. Prisma records completed migrations in PostgreSQL's `_prisma_migrations` table. Running the command again is safe because completed migrations are skipped.
5. `npm run db:generate` generates the TypeScript/JavaScript Prisma client used by the API. It does not create database tables.

For a new empty `dental_clinic` database, one `npm run db:migrate` command applies the initial migration and every later migration. This creates all current tables, foreign keys, indexes, enums, checks, and other constraints. Examples include users and sessions, clinics and rooms, patients, procedures and treatments, payments, laboratories, patient files, system logs, bill categories, and clinic expenses.

Do not copy tables manually from another database, run selected migration files by hand, or use `prisma db push` on a client installation. The committed migration history is the deployment source of truth.

Verify migration status from the deployment checkout:

```powershell
npx prisma migrate status --schema apps/api/prisma/schema.prisma
```

You can also inspect the created tables and applied versions in `psql`:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U clinic -h 127.0.0.1 -d dental_clinic
```

At the `dental_clinic=>` prompt, run:

```sql
\dt
SELECT migration_name, finished_at
FROM "_prisma_migrations"
WHERE finished_at IS NOT NULL
ORDER BY finished_at;
\q
```

When a later NetDenty release changes the database, it includes an additional migration directory. Back up the database, install the matching deployment checkout, and run `npm run db:migrate`; existing clinic data is retained while the new structural change is applied.

## 8. Create the first administrator

Create a separate administrator account:

```powershell
npm run admin:create
```

The default username is `administrator`. The command prints a generated password once. Store it securely and do not include it in installation notes left on the client.

The password must contain 12–128 characters. The command refuses to overwrite an existing account.

The older `npm run dentist:create` command creates a dentist account. For a new multi-user installation, create the administrator first and create dentists, assistants, and receptionists from **Administration → Users**.

## 9. Install the NetDenty desktop application

1. Close any development copy of NetDenty.
2. Run the generated installer from `release`.
3. Choose the installation directory when prompted.
4. Complete the per-user installation.
5. Do not launch the application until `desktop.env` has been created.

The desktop installer includes:

- Electron desktop shell
- React application
- Fastify API runtime
- Prisma client and Windows query engine
- Required production Node modules

It does not include PostgreSQL or automatically create the database.

## 10. Configure a standalone desktop installation

NetDenty reads packaged configuration from this per-user directory:

```text
%APPDATA%\Dental Clinic\desktop.env
```

The `Dental Clinic` profile folder name is intentionally retained for upgrade compatibility even though the application is named NetDenty. Do not rename this folder.

Create the directory and file in PowerShell while signed in as the Windows user who will run NetDenty:

```powershell
$netDentyData = Join-Path $env:APPDATA "Dental Clinic"
New-Item -ItemType Directory -Force -Path $netDentyData | Out-Null
notepad (Join-Path $netDentyData "desktop.env")
```

Use:

```dotenv
DESKTOP_MODE=LOCAL
API_BASE_URL=http://127.0.0.1:4310
DATABASE_URL=postgresql://clinic:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/dental_clinic?schema=public
COOKIE_SECURE=false
SESSION_HOURS=12
```

Restrict the file to the current Windows account:

```powershell
$desktopEnv = Join-Path $env:APPDATA "Dental Clinic\desktop.env"
icacls $desktopEnv /inheritance:r /grant:r "$($env:USERNAME):F"
```

Database credentials are read by the local API process and are never passed to the React renderer.

## 11. First launch and verification

1. Confirm PostgreSQL is running.
2. Start NetDenty from the Start menu.
3. The window should open maximized.
4. Log in with the administrator account.
5. Open **Administration → Clinics & surgical rooms** and confirm the clinic structure.
6. Open **Administration → Users** and create the clinic users.
7. Assign each user to the correct clinic rooms and grant only the required View/Create/Modify/Delete permissions.
8. Open **Currency Setup**, choose USD or LBP as the base currency, and enter the current daily USD/LBP rate when cross-currency records will be used.
9. Create a test patient, procedure, bill category, and expense, then confirm they remain after restarting the application.

While NetDenty is open, verify its local API:

```powershell
Invoke-RestMethod http://127.0.0.1:4310/health
```

Expected response:

```text
status
------
ok
```

In LOCAL mode, Electron owns the API process on port `4310`. Do not start `npm run api:start` separately on the same laptop while the desktop application is running.

## 12. Patient file storage

Uploaded X-rays, photos, and documents are stored outside PostgreSQL under:

```text
%APPDATA%\Dental Clinic\patient-files
```

PostgreSQL stores their metadata. A complete backup must therefore contain both:

1. The PostgreSQL database backup.
2. The `patient-files` directory.

Restoring only one of these components produces incomplete patient file records.

In a REMOTE installation, patient files live on the central server at the directory configured by `PATIENT_FILES_DIR`. They are not stored on each client laptop.

## 13. Backups

An administrator, or a dentist explicitly granted Backup & Restore access, can open **Settings → Backup & Restore** and select **Create backup**. NetDenty creates a PostgreSQL custom archive containing every table, relationship, sequence, and data record in the configured application schema. Tables added by later screens are included automatically.

### Database backup

Use the Windows save window to choose a local disk or connected USB drive. Backup files use a dated sequential name such as `NetDenty-backup-2026-10-03-001.dump`. PostgreSQL client tools must be installed on the computer running the API. NetDenty discovers standard Windows PostgreSQL installations automatically. For a nonstandard installation, set `POSTGRES_BIN` in `.env` or `desktop.env` to the folder containing `pg_dump.exe` and `pg_restore.exe`.

### Patient files backup

```powershell
$source = Join-Path $env:APPDATA "Dental Clinic\patient-files"
$destination = Join-Path "D:\NetDentyBackups" "patient-files-$stamp"
Copy-Item -LiteralPath $source -Destination $destination -Recurse
```

Store backups on encrypted removable storage or protected network storage. Test restoration periodically on a separate test database and folder.

## 14. Restore procedure

Restoration replaces clinic data. Perform it only with a verified backup during a maintenance period.

1. Stop NetDenty on all connected workstations.
2. Preserve the current database and patient-files directory as an additional backup.
3. Keep one administrator workstation open and go to **Settings → Backup & Restore**.
4. Choose the matching `.dump` file from the local disk or USB drive, then confirm **Restore database**. NetDenty validates the archive before changing data and applies the restore in one PostgreSQL transaction.
5. Restore the matching `patient-files` directory separately.
6. Install the application version compatible with that backup.
7. Run `npm run db:migrate` from the matching or newer deployment checkout.
8. Restart NetDenty and verify patients, files, payments, and settings. Sign in again if the restored session data requires it.

## 15. Application updates

For every update:

1. Back up PostgreSQL and `patient-files`.
2. Close NetDenty on all affected workstations.
3. Copy the new deployment checkout to the administrator’s deployment directory.
4. Run:

```powershell
npm ci
npm run db:generate
npm run db:migrate
```

5. Install the new Windows installer over the existing application.
6. Start NetDenty and complete the verification checklist.

Never edit an already-applied migration. New releases must add a new versioned migration.

## 16. Shared installation for multiple laptops

For multiple workstations, use a central API rather than allowing every laptop to connect directly to PostgreSQL.

### Central server

Install PostgreSQL, Node.js, the deployment checkout, and the NetDenty API on one protected server. Configure the server environment:

```dotenv
DATABASE_URL=postgresql://clinic:YOUR_URL_ENCODED_PASSWORD@127.0.0.1:5432/dental_clinic?schema=public
HOST=127.0.0.1
PORT=4310
APP_ORIGIN=https://netdenty.your-clinic-domain.example
COOKIE_SECURE=true
SESSION_HOURS=12
PATIENT_FILES_DIR=D:\NetDentyData\patient-files
```

Then run:

```powershell
npm ci
npm run build
npm run db:migrate
npm run admin:create
npm run api:start
```

Place the API behind an HTTPS reverse proxy such as IIS, Caddy, or nginx. The proxy must forward every application path to `http://127.0.0.1:4310`. Use a valid certificate and configure the API as a supervised Windows service using your deployment tooling.

Keep PostgreSQL private. Do not expose port `5432` to clinic workstations or the internet.

### Each remote client laptop

Install the same NetDenty desktop version and create:

```text
%APPDATA%\Dental Clinic\desktop.env
```

with only:

```dotenv
DESKTOP_MODE=REMOTE
API_BASE_URL=https://netdenty.your-clinic-domain.example
```

Do not include `DATABASE_URL` on remote clients. REMOTE mode requires HTTPS except for loopback testing.

Verify that every workstation sees the same test patient and that clinic/room permissions restrict each user correctly.

## 17. Firewall guidance

### Standalone laptop

- PostgreSQL `5432`: loopback only; no inbound firewall rule required.
- NetDenty API `4310`: loopback only; no inbound firewall rule required.

### Central server

- PostgreSQL `5432`: private server access only; block workstation and internet access.
- NetDenty API `4310`: loopback only behind the reverse proxy.
- HTTPS `443`: allow only the clinic network or approved remote access path.

## 18. Troubleshooting

### `CREATE is not recognized`

The SQL command was entered in Command Prompt or PowerShell. Start `psql` first, then run the SQL at the `postgres=#` prompt.

### `permission denied to create database`

Connect as the PostgreSQL `postgres` administrator and create the database with `OWNER clinic`. Do not run database creation as the restricted `clinic` role.

### Prisma reports that a migration failed

Do not create tables manually. Preserve the complete error, back up the database, and correct the deployment issue before using `prisma migrate resolve`. Migration resolution must match the real database state.

### NetDenty shows the connection page

Check:

```powershell
Get-Service postgresql*
Test-NetConnection 127.0.0.1 -Port 5432
Get-Content (Join-Path $env:APPDATA "Dental Clinic\desktop.env")
```

Confirm that the database password and URL encoding are correct and that port `4310` is not already used by another process:

```powershell
Get-NetTCPConnection -LocalPort 4310 -ErrorAction SilentlyContinue
```

### Cross-currency expense or payment cannot be saved

Open **Currency Setup** and add a USD/LBP rate dated today or an earlier date in the same calendar year. NetDenty never invents a rate and does not use a previous year’s rate.

### Uploaded image metadata exists but preview is missing

For LOCAL mode, verify that the matching `%APPDATA%\Dental Clinic\patient-files` directory was restored and that the current Windows user can read it. For REMOTE mode, verify the central server directory configured by `PATIENT_FILES_DIR` instead.

## 19. Security and distribution checklist

- Keep the installer, deployment checkout, `.env`, and database credentials under administrator control.
- Sign the production installer.
- Use a dedicated Windows user account for clinic operation.
- Enable full-disk encryption on laptops and backup drives.
- Never place database credentials in `VITE_*` variables or client-side files.
- Never expose PostgreSQL directly to remote laptops.
- Use HTTPS for every REMOTE deployment.
- Disable departed users from NetDenty Administration immediately.
- Maintain tested database and patient-file backups.

Controlling the installer alone is not a licensing system. The current application does not contain license activation tied to a specific client. If installation must be technically restricted to licensed clinics, add a signed license/activation mechanism before commercial distribution.

## 20. Final handover checklist

- [ ] PostgreSQL service starts automatically.
- [ ] `clinic` role and `dental_clinic` database exist.
- [ ] All Prisma migrations are applied.
- [ ] Administrator credentials are stored securely.
- [ ] NetDenty installer is installed and signed for production use.
- [ ] `desktop.env` is created for the correct Windows user.
- [ ] Administrator login succeeds.
- [ ] Clinic, rooms, users, assignments, and permissions are configured.
- [ ] Base currency and current exchange rate are configured.
- [ ] Test patient and expense survive an application restart.
- [ ] PostgreSQL backup completes successfully.
- [ ] Patient-files backup completes successfully.
- [ ] A restore test has been performed outside the live database.
