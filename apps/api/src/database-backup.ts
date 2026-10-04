import type { FastifyInstance, FastifyRequest } from "fastify";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import type { Config } from "./config.js";

const BACKUP_CONTENT_TYPE = "application/vnd.netdenty.postgresql-backup";
const MAX_BACKUP_SIZE = 2 * 1024 * 1024 * 1024;
const workDirectory = join(tmpdir(), "netdenty-database-backups");
let operationRunning = false;

type BackupUpload = { path: string; size: number };
type BackupErrorCode =
  | "BACKUP_BUSY"
  | "BACKUP_TOOL_UNAVAILABLE"
  | "BACKUP_FAILED"
  | "RESTORE_FAILED"
  | "INVALID_BACKUP_FILE";

export class DatabaseBackupError extends Error {
  constructor(public code: BackupErrorCode) {
    super(code);
  }
}

function connectionEnvironment(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const schema = url.searchParams.get("schema") ?? "public";
  if (!database || !url.username || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema))
    throw new DatabaseBackupError("BACKUP_FAILED");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return { database, schema, env };
}

async function postgresTool(name: "pg_dump" | "pg_restore", configured?: string) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  if (configured) return resolve(configured, executable);
  if (process.platform === "win32") {
    const root = join(process.env.ProgramFiles ?? "C:\\Program Files", "PostgreSQL");
    const versions = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const version of versions
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => Number(b.name) - Number(a.name))) {
      const candidate = join(root, version.name, "bin", executable);
      if (await stat(candidate).then((value) => value.isFile()).catch(() => false)) return candidate;
    }
  }
  return executable;
}

async function run(executable: string, args: string[], env: NodeJS.ProcessEnv, failure: BackupErrorCode) {
  return new Promise<string>((done, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let errorText = "";
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      if (output.length < 8_000_000) output += chunk.toString("utf8").slice(0, 8_000_000 - output.length);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (errorText.length < 4000) errorText += chunk.toString("utf8").slice(0, 4000 - errorText.length);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      reject(new DatabaseBackupError(error.code === "ENOENT" ? "BACKUP_TOOL_UNAVAILABLE" : failure));
    });
    child.once("exit", (code) => {
      if (code === 0) done(output);
      else {
        const result = new DatabaseBackupError(failure) as DatabaseBackupError & { technicalDetails?: string };
        result.technicalDetails = errorText.replace(/password\s*[:=]\s*\S+/gi, "password=[redacted]").slice(0, 4000);
        reject(result);
      }
    });
  });
}

async function nextFilename() {
  await mkdir(workDirectory, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const sequencePath = join(workDirectory, `sequence-${date}.txt`);
  const previous = Number.parseInt(await readFile(sequencePath, "utf8").catch(() => "0"), 10) || 0;
  const sequence = previous + 1;
  await writeFile(sequencePath, String(sequence), "utf8");
  return `NetDenty-backup-${date}-${String(sequence).padStart(3, "0")}.dump`;
}

async function createBackup(config: Config) {
  const filename = await nextFilename();
  const path = join(workDirectory, `${randomUUID()}-${filename}`);
  const { database, schema, env } = connectionEnvironment(config.DATABASE_URL);
  const executable = await postgresTool("pg_dump", config.POSTGRES_BIN);
  try {
    await run(executable, ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--schema", schema, "--file", path, database], env, "BACKUP_FAILED");
    const file = await stat(path);
    if (!file.size) throw new DatabaseBackupError("BACKUP_FAILED");
    return { filename, path, size: file.size };
  } catch (error) {
    await rm(path, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function restoreBackup(config: Config, archive: string) {
  const { database, schema, env } = connectionEnvironment(config.DATABASE_URL);
  const executable = await postgresTool("pg_restore", config.POSTGRES_BIN);
  const contents = await run(executable, ["--list", archive], env, "INVALID_BACKUP_FILE");
  const escapedSchema = schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\bTABLE ${escapedSchema} User\\b`).test(contents))
    throw new DatabaseBackupError("INVALID_BACKUP_FILE");
  await run(
    executable,
    ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", "--exit-on-error", "--schema", schema, "--dbname", database, archive],
    env,
    "RESTORE_FAILED",
  );
}

export function registerDatabaseBackup(
  app: FastifyInstance,
  config: Config,
  authorize: (request: FastifyRequest, action: "create" | "modify") => Promise<unknown>,
) {
  app.addContentTypeParser(BACKUP_CONTENT_TYPE, (request, payload, done) => {
    const path = join(workDirectory, `${randomUUID()}.upload`);
    let size = 0;
    void mkdir(workDirectory, { recursive: true })
      .then(async () => {
        payload.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BACKUP_SIZE) payload.destroy(new DatabaseBackupError("INVALID_BACKUP_FILE"));
        });
        await pipeline(payload, createWriteStream(path, { flags: "wx" }));
        done(null, { path, size } satisfies BackupUpload);
      })
      .catch(async (error) => {
        await rm(path, { force: true }).catch(() => undefined);
        done(error as Error);
      });
  });

  app.get("/api/admin/database-backup", async (request, reply) => {
    await authorize(request, "create");
    if (operationRunning) throw new DatabaseBackupError("BACKUP_BUSY");
    operationRunning = true;
    try {
      const backup = await createBackup(config);
      reply.header("Content-Type", BACKUP_CONTENT_TYPE);
      reply.header("Content-Length", String(backup.size));
      reply.header("Content-Disposition", `attachment; filename="${backup.filename}"`);
      const stream = createReadStream(backup.path);
      stream.once("close", () => void rm(backup.path, { force: true }));
      return reply.send(stream);
    } finally {
      operationRunning = false;
    }
  });

  app.post(
    "/api/admin/database-restore",
    {
      bodyLimit: MAX_BACKUP_SIZE,
      onRequest: async (request) => { await authorize(request, "modify"); },
    },
    async (request) => {
      const upload = request.body as BackupUpload;
      const root = `${resolve(workDirectory)}${sep}`;
      if (!upload?.path || !upload.size || !resolve(upload.path).startsWith(root)) {
        if (upload?.path) await rm(upload.path, { force: true }).catch(() => undefined);
        throw new DatabaseBackupError("INVALID_BACKUP_FILE");
      }
      if (operationRunning) {
        await rm(upload.path, { force: true }).catch(() => undefined);
        throw new DatabaseBackupError("BACKUP_BUSY");
      }
      operationRunning = true;
      try {
        await restoreBackup(config, upload.path);
        return { restored: true };
      } finally {
        operationRunning = false;
        await rm(upload.path, { force: true }).catch(() => undefined);
      }
    },
  );
}
