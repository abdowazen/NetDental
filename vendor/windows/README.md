# Windows installer prerequisites

The NetDenty server package embeds verified third-party installation assets so the clinic server does not need Node.js, npm, PostgreSQL, or internet access during setup.

Place these x64 files in this directory before running `npm run installers`:

1. The current PostgreSQL 18 Windows installer, renamed to `postgresql-18-windows-x64.exe`.
2. The current standard Caddy Windows x64 executable, named `caddy.exe`.

Download PostgreSQL only through the Windows download page linked by the PostgreSQL project. PostgreSQL documents that its Windows installer supports silent installation and that its binary package is intended for embedding in another application installer:

- https://www.postgresql.org/download/windows/
- https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/command_line_parameters/

Download Caddy from its official download or GitHub release page:

- https://caddyserver.com/download
- https://github.com/caddyserver/caddy/releases

Calculate each file's SHA-256 digest:

```powershell
Get-FileHash .\vendor\windows\postgresql-18-windows-x64.exe -Algorithm SHA256
Get-FileHash .\vendor\windows\caddy.exe -Algorithm SHA256
```

Put the exact digests into `manifest.json`. The build stops if a digest is absent or does not match. Do not commit the large vendor executables to Git unless your distribution and repository policies explicitly allow it.
