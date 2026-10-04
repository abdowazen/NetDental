import "dotenv/config";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:4310"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  SESSION_HOURS: z.coerce.number().min(1).max(168).default(12),
  WEB_DIST: z.string().optional(),
  PATIENT_FILES_DIR: z.string().min(1).optional(),
  POSTGRES_BIN: z.string().min(1).optional(),
});
export function readConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      "Invalid configuration: check DATABASE_URL, APP_ORIGIN, PORT and SESSION_HOURS.",
    );
  const c = parsed.data;
  const origin = new URL(c.APP_ORIGIN);
  if (
    origin.origin !== c.APP_ORIGIN ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new Error("APP_ORIGIN must be an HTTP(S) origin without a path.");
  if (origin.protocol === "https:" && c.COOKIE_SECURE !== "true")
    throw new Error("HTTPS requires COOKIE_SECURE=true.");
  if (
    origin.protocol === "http:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname)
  )
    throw new Error("Non-loopback deployments require HTTPS.");
  return { ...c, secure: c.COOKIE_SECURE === "true" };
}
export type Config = ReturnType<typeof readConfig>;
