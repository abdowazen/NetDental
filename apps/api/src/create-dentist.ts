import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { createDentistSchema } from "@clinic/shared";
import { passwordOptions } from "./app.js";
const db = new PrismaClient();
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
});
async function ask(label: string, secret = false) {
  if (!process.stdin.isTTY)
    throw new Error("Set all DENTIST_* variables for noninteractive use.");
  process.stdout.write(label);
  muted = secret;
  try {
    return await rl.question("");
  } finally {
    muted = false;
    if (secret) process.stdout.write("\n");
  }
}
try {
  const username =
    process.env.DENTIST_USERNAME ??
    (await ask("Username (3–64 ASCII letters, digits, . _ -): "));
  const displayName =
    process.env.DENTIST_DISPLAY_NAME ?? (await ask("Display name: "));
  const preferredLanguage = process.env.DENTIST_LANGUAGE ?? "en";
  const password =
    process.env.DENTIST_PASSWORD ??
    (await ask("Password (12–128 characters; hidden): ", true));
  if (
    !process.env.DENTIST_PASSWORD &&
    password !== (await ask("Confirm password (hidden): ", true))
  )
    throw new Error("Password confirmation does not match.");
  const parsed = createDentistSchema.safeParse({
    username,
    displayName,
    preferredLanguage,
    password,
  });
  if (!parsed.success)
    throw new Error(
      "Invalid input. Username: 3–64 ASCII letters/digits/._-. Name: 1–100 characters. Password: 12–128 characters. Language: en/fr.",
    );
  if (await db.user.findUnique({ where: { username: parsed.data.username } }))
    throw new Error("Username already exists; no changes made.");
  const { password: secret, ...data } = parsed.data;
  await db.user.create({
    data: { ...data, passwordHash: await hash(secret, passwordOptions) },
  });
  console.log("Dentist created.");
} catch (e) {
  // Only our explicit validation errors are suitable for display.
  const message =
    e instanceof Error && e.constructor === Error
      ? e.message
      : "Creation failed. Check database configuration; existing users are never overwritten.";
  console.error(message);
  process.exitCode = 1;
} finally {
  rl.close();
  delete process.env.DENTIST_PASSWORD;
  await db.$disconnect();
}
