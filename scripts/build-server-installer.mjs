import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.platform !== "win32") throw new Error("The server installer must be built on Windows x64.");
const root = process.cwd();
const vendorRoot = resolve("vendor/windows");
const manifestPath = join(vendorRoot, "manifest.json");
const manifest = JSON.parse((await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, ""));

async function verifiedAsset(entry, label) {
  if (!entry?.file || !/^[a-fA-F0-9]{64}$/.test(entry.sha256 ?? ""))
    throw new Error(`${label} is not configured in vendor/windows/manifest.json.`);
  const file = join(vendorRoot, entry.file);
  const bytes = await readFile(file);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual.toLowerCase() !== entry.sha256.toLowerCase())
    throw new Error(`${label} SHA-256 verification failed.`);
  return file;
}

const postgresInstaller = await verifiedAsset(manifest.postgresqlInstaller, "PostgreSQL installer");
const caddyExecutable = await verifiedAsset(manifest.caddy, "Caddy executable");
const workstationCandidates = (await readdir("release"))
  .filter((name) => /^NetDenty-Workstation-Setup-.*\.exe$/i.test(name));
if (!workstationCandidates.length) throw new Error("Build the NetDenty workstation installer first.");
const workstationInstaller = resolve("release", workstationCandidates.sort().at(-1));

const stageResult = spawnSync(process.execPath, ["scripts/stage.mjs"], { cwd: root, stdio: "inherit" });
if (stageResult.status !== 0) process.exit(stageResult.status ?? 1);

const payload = resolve(".runtime/server-payload");
const installerStage = resolve(".runtime/server-installer");
await rm(payload, { recursive: true, force: true });
await rm(installerStage, { recursive: true, force: true });
await mkdir(join(payload, "runtime"), { recursive: true });
await mkdir(join(payload, "vendor"), { recursive: true });
await mkdir(join(payload, "workstation"), { recursive: true });
await mkdir(installerStage, { recursive: true });

await cp(".runtime/api", join(payload, "runtime/api"), { recursive: true });
await cp("apps/web/dist", join(payload, "runtime/web"), { recursive: true });
await cp(process.execPath, join(payload, "runtime/node.exe"));
await cp(caddyExecutable, join(payload, "runtime/caddy.exe"));
await cp(postgresInstaller, join(payload, "vendor", basename(postgresInstaller)));
await cp(workstationInstaller, join(payload, "workstation/NetDenty-Workstation-Setup.exe"));
await cp("deploy/windows/Install-NetDentyWorkstation.ps1", join(payload, "workstation/Install-NetDentyWorkstation.ps1"));
await cp("deploy/windows/Install-NetDentyWorkstation.cmd", join(payload, "workstation/Install-NetDentyWorkstation.cmd"));

const payloadArchive = join(installerStage, "netdenty-server-payload.zip");
const archiveResult = spawnSync("tar.exe", ["-a", "-c", "-f", payloadArchive, "-C", payload, "."], { stdio: "inherit" });
if (archiveResult.status !== 0) throw new Error("Could not create the server payload archive.");
await cp("deploy/windows/Install-NetDentyServer.ps1", join(installerStage, "Install-NetDentyServer.ps1"));
await cp("deploy/windows/Install-NetDentyServer.cmd", join(installerStage, "Install-NetDentyServer.cmd"));

const releaseZip = resolve("release/NetDenty-Server-Installer.zip");
await rm(releaseZip, { force: true });
const zipResult = spawnSync("tar.exe", ["-a", "-c", "-f", releaseZip, "-C", installerStage, "."], { stdio: "inherit" });
if (zipResult.status !== 0) throw new Error("Could not create the server installer ZIP.");

const serverExe = resolve("release/NetDenty-Server-Setup.exe");
const nsisPath = join(installerStage, "server-installer.nsi");
const applicationIcon = resolve("build/icon.ico");
if (!(await stat(applicationIcon).catch(() => null)))
  throw new Error("The NetDenty Windows icon is missing from build/icon.ico.");
const nsisFile = (value) => value.replaceAll("/", "\\");
const nsis = `Unicode true
Name "NetDenty Server"
Caption "NetDenty Server Setup"
OutFile "${nsisFile(serverExe)}"
Icon "${nsisFile(applicationIcon)}"
WindowIcon on
RequestExecutionLevel admin
SetCompress off
ShowInstDetails show
Page instfiles

Section "Install"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${nsisFile(join(installerStage, "Install-NetDentyServer.ps1"))}"
  File "${nsisFile(payloadArchive)}"
  DetailPrint "Starting NetDenty server setup..."
  ExecWait '"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\\Install-NetDentyServer.ps1"' $0
  IntCmp $0 0 completed failed failed
failed:
  MessageBox MB_ICONSTOP "NetDenty server setup failed with exit code $0. See C:\\ProgramData\\NetDenty\\Server\\logs\\install.log for details."
  SetErrorLevel $0
  Abort
completed:
  DetailPrint "NetDenty server setup completed."
SectionEnd
`;
await writeFile(nsisPath, nsis, "utf8");
await rm(serverExe, { force: true });
const { getMakeNsisPath } = await import("app-builder-lib/out/toolsets/windows.js");
const makensis = await getMakeNsisPath();
const nsisResult = spawnSync(makensis.path, ["/V2", nsisPath], {
  stdio: "inherit",
  env: { ...process.env, ...makensis.env },
});
if (nsisResult.status !== 0 || !(await stat(serverExe).catch(() => null)))
  throw new Error("NSIS could not create NetDenty-Server-Setup.exe. The ZIP installer remains available.");
console.log(`Created ${serverExe}`);
console.log(`Created ${releaseZip}`);
