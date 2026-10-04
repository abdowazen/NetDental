# NetDenty

A Windows-first Electron application with a React/TypeScript renderer and a shared Fastify/PostgreSQL API. Includes authentication, patient registration, a dentist workspace, English/French translations, appearance preferences, and currency settings.

For the complete client deployment procedure, see [Windows client installation](docs/windows-client-installation.md).

## Prerequisites and setup (PowerShell)

Install Node.js 22.12 or newer supported LTS, npm, and PostgreSQL 17 or 18. PostgreSQL remains a separately installed and managed service. Docker is optional and is not used by the installed application.

```powershell
npm ci
Copy-Item .env.example .env
```

Create a dedicated database role and database using PostgreSQL's `psql` as an administrator. If PostgreSQL is not on PATH, use its full executable path, for example `C:\Program Files\PostgreSQL\18\bin\psql.exe`.

```sql
CREATE ROLE clinic LOGIN;
\password clinic
CREATE DATABASE dental_clinic OWNER clinic;
```

The `\password` command prompts securely. Set `DATABASE_URL` in `.env` using this role/password; percent-encode special characters in the URL password. Keep the file private. The example password is a placeholder, not an account provisioned by the application.

Alternatively, set `POSTGRES_PASSWORD` in your shell and run `docker compose up -d postgres` for a development database. The Compose port binds to loopback only.

```powershell
npm run db:migrate
npm run dentist:create
npm run dev
```

The creation command prompts for a username, display name and hidden password (minimum 12 characters), with confirmation. It never overwrites users. `npm run dev` builds the workspaces and starts Electron, which starts its own API in LOCAL mode. PostgreSQL must already be running. Re-run this command after source changes.

For browser hot reload, run `npm run api:start` and `npm run dev:web` in separate terminals, with `APP_ORIGIN=http://127.0.0.1:5173` in the API environment. Open `http://127.0.0.1:5173`; Vite proxies API requests. Restore `APP_ORIGIN=http://127.0.0.1:4310` before desktop use. Hot reload is an optional browser workflow, not required for desktop startup.

## Configuration

| Variable                                                                           | Purpose                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                     | API/CLI only: PostgreSQL connection URL. Required for LOCAL and server deployments. Never a `VITE_*` variable.                                                                          |
| `HOST` / `PORT`                                                                    | API listener, defaults `127.0.0.1` / `4310`. Desktop LOCAL derives these from its loopback URL.                                                                                         |
| `APP_ORIGIN`                                                                       | Exact renderer origin with no trailing slash; default `http://127.0.0.1:4310`. Used for mutation origin validation.                                                                     |
| `COOKIE_SECURE`                                                                    | `false` for local loopback HTTP only; `true` required for HTTPS.                                                                                                                        |
| `SESSION_HOURS`                                                                    | Session lifetime, 1–168 hours; default 12.                                                                                                                                              |
| `DESKTOP_MODE`                                                                     | `LOCAL` (default) or `REMOTE`.                                                                                                                                                          |
| `API_BASE_URL`                                                                     | Origin serving API and renderer; default `http://127.0.0.1:4310`. REMOTE requires HTTPS unless loopback.                                                                                |
| `WEB_DIST`                                                                         | Optional API absolute path to built renderer. Desktop configures this automatically.                                                                                                    |
| `DENTIST_USERNAME`, `DENTIST_DISPLAY_NAME`, `DENTIST_PASSWORD`, `DENTIST_LANGUAGE` | Optional CLI provisioning environment input; language defaults to `en`. Supply secrets through a secure deployment environment, clear them afterward, and avoid shell-history literals. |
| `TEST_DATABASE_URL`                                                                | Optional dedicated disposable PostgreSQL database for integration tests.                                                                                                                |

Development reads `.env` at repository root. Packaged Electron reads `%APPDATA%\Dental Clinic\desktop.env` (the existing profile directory, retained so upgrades to NetDenty keep their configuration). Environment variables override file values. Restrict filesystem access to this file when it holds a local database password. No database configuration is passed to the renderer.

## Currency settings

Business records and currency settings now belong to a surgical room, which belongs to a clinic. Existing data was assigned to Main Clinic / Room 1. Base currency and daily rates apply to the active room.

## Administration and workspaces

An administrator can open Administration to create users, reset passwords, disable accounts, grant View/Create/Modify/Delete per screen, and assign users to rooms across clinics. Clinic and room definitions can be created and renamed there. A room cannot be moved between clinics through these forms, preserving record ownership. Administrators have access to all rooms and manage all accounts; ordinary users only access assigned rooms and granted screens. Disabled accounts and password resets invalidate sessions; permission/assignment changes are rechecked on every business API request. The last active administrator cannot be demoted or disabled.

Users with several available rooms choose an active clinic and room in the header. Users with one assignment use it automatically. Users without assignments cannot access business records. Switching rooms clears pending queries and remounts the workspace, discarding unsaved edits. Patient and currency queries include room IDs in cache keys. The server validates `X-Clinic-Room` against current assignments; patient reads, counts, updates and deletes filter by room. Global account/session records and clinic definitions are administrative metadata, not room-owned clinical data.

New users start with no screen permissions until the administrator grants them. View is required before Create/Modify/Delete can be granted. Existing users retained their previous screen permissions in Main Clinic / Room 1 during migration. Permissions for upcoming screens are saved now; those screens remain unavailable until implemented. Appearance is device-local, and language remains an account preference.

For an additional administrator, run `npm run admin:create`. It defaults to the username `administrator`, refuses to overwrite existing accounts, and generates a password printed once. Alternatively supply `ADMIN_USERNAME` and `ADMIN_PASSWORD` through a secure environment. Do not commit credentials. `npm run test:access` validates administration, permissions, location isolation and browser switching in a temporary isolated schema on port 14321.

## Currency behavior

Settings includes a clinic-wide base currency (USD by default, or LBP), manual daily USD/LBP exchange rates, current-year rate history, and a conversion preview. Apply the currency migration with `npm run db:migrate` before starting the updated app. Rates are not fetched from an external provider or seeded with an assumed market rate.

Enter rates as **1 USD = X LBP**, with up to six decimal places. Saving an existing date replaces that day's rate. All authenticated dentists can manage these shared settings. The applicable rate is today's rate, otherwise the latest available date in the same calendar year on or before today. Business dates use `Asia/Beirut`. Future dates are rejected; previous-year rates never substitute for missing current-year rates. If none exists, cross-currency conversion is unavailable until a rate is entered. Conversion uses decimal integer arithmetic and rounds half away from zero to two decimal places.

`GET /currencies` returns the base currency, business date, current-year rates and effective rate. `PATCH /currencies` saves the base currency, and `PUT /currencies/rates` saves a daily rate. The shared `convertCurrency` helper supports USD/LBP conversion in both directions. Patient payments and clinic expenses retain the original currency, amount, applied rate and base-currency snapshot so later rate edits do not rewrite historical values.

## LOCAL deployment

1. Install and configure the PostgreSQL service separately. Create the role/database above.
2. From an administrator's deployment checkout, run `npm ci`, configure the database URL, then `npm run db:migrate` and `npm run dentist:create`.
3. Install the Windows application and create `%APPDATA%\Dental Clinic\desktop.env`:

```dotenv
DESKTOP_MODE=LOCAL
API_BASE_URL=http://127.0.0.1:4310
DATABASE_URL=postgresql://clinic:YOUR_ENCODED_PASSWORD@127.0.0.1:5432/dental_clinic?schema=public
COOKIE_SECURE=false
```

Electron starts the packaged API in its own Node utility process. The API serves the built renderer from the same origin. A single-instance lock prevents duplicate desktop launches for this user profile. Startup checks `/health`, including database table access, for a bounded interval before opening the workspace. Failure displays a local translated retry screen. Closing Electron terminates only its own API child; it never stops PostgreSQL or unrelated servers. Do not start a separate API on the same LOCAL port.

Migrations are always explicit deployment operations, never automatic application-launch actions. Back up your database before future upgrades. The migration command requires the deployment checkout and Node; ordinary workstation users do not need Node or source files.

## REMOTE deployment

Build and run the API on a shared server:

```powershell
npm ci
npm run build
npm run db:migrate
npm run dentist:create
npm run api:start
```

Set server `DATABASE_URL`, `APP_ORIGIN=https://clinic.example.com`, and `COOKIE_SECURE=true`. Put the API behind an HTTPS reverse proxy forwarding every path (including `/auth`, `/users`, `/health`, assets, and application routes) to its loopback listener. Keep PostgreSQL on a private network. Configure the API as a supervised service using your deployment tooling. The API does not trust arbitrary forwarded-IP headers, so login rate limiting behind a proxy is conservatively shared by the proxy address; configure a trusted proxy policy before increasing scale.

On each workstation, place only the following in `desktop.env`:

```dotenv
DESKTOP_MODE=REMOTE
API_BASE_URL=https://clinic.example.com
```

REMOTE never starts or stops the server and requires no workstation database credentials. All workstations use the same API and PostgreSQL database. Each renderer uses the server's application build, keeping client/API versions aligned.

## Security and architecture

- `apps/desktop`: window lifecycle and API ownership; sandboxed renderer, context isolation, no Node integration, restricted navigation, HTTPS-only external links, denied permissions. Its small typed preload bridge only handles the bundled connection screen and checks IPC sender identity/origin.
- `apps/web`: feature folders for auth/dashboard/settings, shared accessible controls and shell, React Router, TanStack Query, React Hook Form/Zod, i18next. Only the device language is kept in localStorage.
- `apps/api`: domain logic, Argon2id password hashing, opaque 256-bit sessions whose SHA-256 hashes are stored server-side, authenticated dentist guard, input validation and sanitized error codes.
- `packages/shared`: common validation and public API types; no database access from React or Electron IPC.

Usernames are trimmed, restricted to 3–64 ASCII letters/digits/period/underscore/hyphen, and lowercased before use. A PostgreSQL CHECK constraint and unique index enforce the same canonical representation. Passwords are never logged. Production HTTPS cookies are `__Host-` prefixed, `Secure`, `HttpOnly`, `SameSite=Strict`, with fixed expiry. Local HTTP cookies omit `Secure` on loopback. Mutations require the exact configured `Origin` and a custom header; there is no permissive CORS setup. Logout deletes the session and clears client query data. Expired sessions are removed periodically and on login; every protected access checks expiry, account activity, and role.

The API serves production HTML/assets so renderer and API cookies are same-origin in both packaged and browser deployments. CSP blocks external scripts, frames and objects. The offline page has its own strict CSP. No TLS exceptions or disabled web security are used.

Endpoints: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /users/me/preferences`, `GET /health`. Responses use `{error:{code}}` for failures. Logout is idempotent; profile/preferences require an active dentist session. There is no registration or password-reset endpoint.

## Checks and packaging

```powershell
npm run lint
npm run typecheck
npm test
npm run build
```

Focused API tests use real Fastify handlers, cookie handling and Argon2id against an isolated in-memory persistence adapter. To exercise real PostgreSQL migrations, CLI provisioning and sessions, create a separate empty test database, set `TEST_DATABASE_URL`, then run:

```powershell
npm run test:integration
```

This command applies migrations to the explicitly selected database, creates a unique test dentist and removes that account afterward. It does not reset or drop databases.

With that same test database configured, `npm run test:desktop` launches Electron with an isolated profile and verifies login, refresh, navigation, language persistence, logout, connection retry/recovery, and LOCAL/REMOTE process ownership. It creates and removes its own test account. To run it against the packaged executable, set `TEST_DESKTOP_EXE` to `release/win-unpacked/NetDenty.exe`. Screenshots are saved under the ignored `.runtime/` folder. The test uses loopback ports 14310 and 14311, which must be free.

```powershell
npm run desktop:unpacked
npm run desktop:package
```

Build on Windows x64. The installer is written under `release/`; the unpacked application is `release/win-unpacked/NetDenty.exe`. Staging includes compiled API JavaScript, production dependencies, Argon2 native assets, generated Prisma client/Windows engine, and the built renderer. PostgreSQL is not bundled. The current development installer is unsigned; production distribution needs your organization's Windows signing setup. Building an installer is distinct from installing/testing it; see `VERIFICATION.md` for checks actually performed in this environment.

The lockfile is included for reproducible workspace installation. Package upgrades should be checked together with `npm ci`, lint/type checks, tests, builds, and a packaged runtime smoke test.

Versions are pinned deliberately, including Prisma 6.19.3 and matching client. A scoped override upgrades `@prisma/config`'s `deepmerge-ts` dependency to 8.0.0 to address its recursive-merge advisory; client generation and migration deployment are checked with this override. The workspace does not use custom Prisma configuration merges. `npm run format` applies the shared source formatting.

## Patient registration

Clinical → Patients Registration opens the patient search screen. Search is debounced by 250 ms, case-insensitive, and matches literal substrings of full name (including last name), phone and file ID. PostgreSQL trigram indexes support substring searches. Results load 30 at a time using an ID cursor and newest-first ordering. In-flight searches are cancelled when the query changes.

New Patient opens a validated form. First name, last name, phone and gender are required. Full name is derived from the trimmed first and last names. File IDs are database-generated, unique, immutable numbers beginning at 100000; they can grow beyond six digits and are never reused after deletion. Job defaults to No Job, age to 0, and first visit to today's Beirut business date. Job choices are No Job, Student, Employee, Self-employed, Retired and Other. Age accepts whole numbers from 0 to 150; notes support 4000 characters.

Saving returns to an unfiltered search with new records first. Results open the same populated form for editing, and both the form and result rows offer deletion with confirmation. Deletion permanently removes the record. Empty searches link to creation and prefill either phone or first/last name, preserving the derived full-name field. All endpoints require an active dentist session; writes enforce the existing origin and CSRF checks.

API: `GET/POST /api/patients` and `GET/PUT/DELETE /api/patients/:id`. Apply migrations explicitly with `npm run db:migrate`. `npm test` covers validation and authenticated API behavior. `npm run test:patients` uses the configured PostgreSQL database with a temporary isolated schema and headless Microsoft Edge for database and browser checks, then removes the test schema. It requires schema-creation permission and port 14320 to be free; clinic patient records and sequences are not used by the test.

## Extending clinical features

Add versioned Prisma models/migrations and validated API routes behind the existing session and dentist guard. Put shared public schemas in `packages/shared` and React views in feature folders. Use the API client and TanStack Query, register protected routes, and add matching keys to both locale files. Keep domain rules in the API. Do not add database or broad filesystem access to Electron's bridge.

Compatibility references: [Fastify 5 requires Node 20+](https://fastify.dev/docs/v5.0.x/Guides/Migration-Guide-V5/), [Prisma system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements), and [Electron utility processes](https://www.electronjs.org/docs/latest/api/utility-process).
