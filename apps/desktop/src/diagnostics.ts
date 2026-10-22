import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { databaseFailure } from "./database-failure";

const execute = promisify(execFile);
type Options = {
  target: string;
  mode: string;
  valid: boolean;
  packaged: boolean;
  apiRoot: string;
  envFile: string;
  node: string;
  apiOwned: boolean;
  startupCode: number | null;
  fetch: (url: string) => Promise<Response>;
};

// Only explicitly selected fields and fixed messages enter the support report.
// Never include environment values, raw exceptions, response bodies or command lines.
export async function collectDiagnostics(options: Options): Promise<string> {
  const lines = ["NetDenty connection diagnostics", `Collected: ${new Date().toISOString()}`,
    `Build: ${options.packaged ? "installed" : "development"}; mode: ${options.mode === "LOCAL" ? "LOCAL" : "REMOTE"}`,
    `Desktop configuration: ${options.valid ? "PASS" : "FAIL"}`,
    `Owned API process: ${options.apiOwned ? "running" : "not running"}`,
    `Last owned API exit: ${options.startupCode ?? "not recorded"}`];
  let origin = "";
  try {
    const url = new URL(options.target);
    if (!options.valid || url.username || url.password) throw new Error();
    origin = url.origin;
    lines.push(`Configured origin: ${origin}`);
  } catch { lines.push("Configured origin: invalid or unavailable"); }

  const health = async (name: string, base: string) => {
    if (!base) return `${name}: SKIP (no valid configured origin)`;
    const started = Date.now();
    try {
      const response = await options.fetch(`${base}/health`);
      const body = await response.json() as { status?: unknown };
      return `${name}: ${response.ok && body.status === "ok" ? "PASS" : "FAIL"}; HTTP ${response.status}; ${Date.now() - started} ms (desktop limit: 1500 ms)`;
    } catch { return `${name}: FAIL (network, certificate, invalid response or timeout; no certificate bypass used)`; }
  };
  const checks: Promise<string>[] = [health("Configured API + database health", origin)];
  if (origin) checks.push((async () => {
    try {
      const response = await options.fetch(`${origin}/`);
      const html = await response.text();
      return `Application HTML: ${response.ok && /<html/i.test(html) && /<script/i.test(html) ? "PASS" : "FAIL"}; HTTP ${response.status} (JavaScript execution not tested)`;
    } catch { return "Application HTML: FAIL (network, certificate or timeout)"; }
  })());

  if (options.mode === "LOCAL") {
    const entry = options.packaged ? "server.mjs" : "dist/server.js";
    lines.push(`API entry file: ${existsSync(join(options.apiRoot, entry)) ? "PASS" : "FAIL"}`,
      `API environment file: ${existsSync(options.envFile) ? "present" : "missing"}`);
    checks.push((async () => {
      // Run independently of API startup so a port or plugin failure does not
      // prevent an authenticated database check. A fixed script reads its own
      // .env; no credentials are passed in command arguments or printed.
      const code = `
        const {createRequire}=require('node:module');
        const {resolve}=require('node:path');
        const load=createRequire(resolve(process.cwd(),'package.json'));
        let db; let stage='runtime loading';
        (async()=>{try {
          load('dotenv').config({path:process.env.NETDENTY_DIAGNOSTIC_ENV,override:false,quiet:true});
          if(!process.env.DATABASE_URL) {console.log('Database: FAIL (DATABASE_URL missing)');return;}
          stage='client initialization';
          const {PrismaClient}=load('@prisma/client'); db=new PrismaClient();
          stage='database query';
          await db.$queryRawUnsafe('SELECT 1');
          console.log('Database authenticated SELECT 1: PASS');
          const rows=await db.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL');
          console.log('Failed or unfinished migrations: '+rows.length);
          const units=await db.$queryRawUnsafe("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Unit') AS present");
          console.log('Inventory Unit table: '+(units[0]?.present?'present':'MISSING (apply migrations)'));
        } catch(error) {
          console.log((${databaseFailure.toString()})(error));
          console.log('Database check stage: '+stage);
        }
        finally {if(db)await db.$disconnect();}})().catch(()=>process.exit(1));`;
      try {
        const result = await execute(options.node, ["-e", code], {
          cwd: options.apiRoot, windowsHide: true, timeout: 12000, maxBuffer: 16384,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", NETDENTY_DIAGNOSTIC_ENV: options.envFile },
        });
        // Discard third-party output; only fixed messages produced above are safe.
        return result.stdout.split(/\r?\n/).filter((line) => /^(Database: FAIL \(DATABASE_URL missing\)|Database authenticated SELECT 1: PASS|Failed or unfinished migrations: \d+|Inventory Unit table: (present|MISSING \(apply migrations\))|Database check stage: (runtime loading|client initialization|database query)|Database\/schema check: FAIL \[(P[0-9]{4}|AUTHENTICATION_FAILED|MODULE_NOT_FOUND|UNKNOWN)\] [a-z;, ]+)$/.test(line)).join("\n") || "Direct database check: unavailable";
      } catch { return "Direct database check: FAIL (runtime unavailable, access denied or 12-second timeout)"; }
    })());
  } else lines.push("Remote mode: database credentials and API process are on the server; run the readiness script there for direct database checks.");

  if (process.platform === "win32") checks.push((async () => {
    const script = `
      $ErrorActionPreference='Stop'
      try { Get-Service -Name 'postgresql*' | ForEach-Object { 'PostgreSQL service: '+$_.Name+'; '+$_.Status } } catch { 'PostgreSQL services: unavailable or not installed on this computer' }
      foreach($name in @('NetDenty API','NetDenty HTTPS')) {
        try { $task=Get-ScheduledTask -TaskName $name; $info=Get-ScheduledTaskInfo -TaskName $name; $name+' task: '+$task.State+'; last result '+$info.LastTaskResult }
        catch { $name+' task: unavailable (missing or access denied)' }
      }
      try { Get-Process -Name node,electron,caddy -ErrorAction SilentlyContinue | ForEach-Object { 'Process: '+$_.ProcessName+'; PID '+$_.Id } } catch { 'Processes: unavailable' }
      try { Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in @(4310,4311,443,5432,${origin ? Number(new URL(origin).port) || (origin.startsWith("https:") ? 443 : 80) : 4311}) } | ForEach-Object { 'Listener: '+$_.LocalPort+'; PID '+$_.OwningProcess } } catch { 'Listeners: unavailable (access denied)' }
    `;
    try {
      const result = await execute(join(process.env.SystemRoot ?? "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 15000, windowsHide: true, maxBuffer: 32768 });
      return result.stdout.trim();
    } catch { return "Windows services/tasks/processes: unavailable (access denied or 15-second timeout)"; }
  })());
  lines.push(...await Promise.all(checks), "", "Read-only report. Missing server tasks are normal in local development or on a workstation.",
    "A running node.exe alone does not identify a healthy NetDenty API. Match listener PIDs to processes.",
    "No passwords, patient data, raw application logs or complete configuration files are included.");
  return lines.join("\r\n");
}
