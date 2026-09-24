import "dotenv/config";
import {
  expect,
  _electron as electron,
  type ElectronApplication,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { passwordOptions, buildApp } from "../apps/api/src/app";
import { prismaStore } from "../apps/api/src/store";
import { readConfig } from "../apps/api/src/config";
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "TEST_DATABASE_URL is required. Apply migrations to this dedicated test database first.",
  );
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const username = `ui_${randomUUID()}`;
const password = randomUUID() + randomUUID();
const profile = resolve(".runtime", `electron-test-${randomUUID()}`);
await mkdir(profile, { recursive: true });
const base = "http://127.0.0.1:14310";
const packaged = process.env.TEST_DESKTOP_EXE;
const desktopEnv = { ...process.env };
delete desktopEnv.ELECTRON_RUN_AS_NODE;
const launch = (mode: "LOCAL" | "REMOTE", apiBase = base) =>
  electron.launch({
    ...(packaged ? { executablePath: resolve(packaged) } : {}),
    args: [
      ...(packaged ? [] : ["apps/desktop/dist/main.cjs"]),
      `--user-data-dir=${profile}`,
    ],
    env: {
      ...desktopEnv,
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      DESKTOP_MODE: mode,
      API_BASE_URL: apiBase,
      COOKIE_SECURE: "false",
      APP_ORIGIN: apiBase,
    },
    timeout: 30000,
  });
let desktop: ElectronApplication | undefined;
let remote: Awaited<ReturnType<typeof buildApp>> | undefined;
try {
  await db.user.create({
    data: {
      username,
      displayName: "Test Dentist",
      passwordHash: await hash(password, passwordOptions),
    },
  });
  desktop = await launch("LOCAL");
  let page = await desktop.firstWindow();
  page.setDefaultTimeout(15000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: ".runtime/login.png" });
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill("incorrect");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The username or password is incorrect.",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByLabel("Password", { exact: true }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready" }),
  ).toBeVisible();
  await page.screenshot({ path: ".runtime/dashboard.png" });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your workspace is ready" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Patients — Coming soon" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByLabel("Language", { exact: true }).selectOption("fr");
  await expect(
    page.getByRole("heading", { name: "Votre espace est prêt" }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await db.user.findUniqueOrThrow({ where: { username } }))
          .preferredLanguage,
    )
    .toBe("fr");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Votre espace est prêt" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ouvrir le menu utilisateur" })
    .click();
  await page
    .locator("#user-dropdown")
    .getByRole("link", { name: "Paramètres" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Informations du compte" }),
  ).toBeVisible();
  await page
    .locator("main")
    .getByLabel("Langue", { exact: true })
    .selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Account details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(await db.session.count({ where: { user: { username } } })).toBe(0);
  expect(errors).toEqual([]);
  await desktop.close();
  desktop = undefined;
  await expect
    .poll(
      async () => {
        try {
          await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 10000 },
    )
    .toBe(false);
  desktop = await launch("REMOTE", "http://127.0.0.1:14311");
  page = await desktop.firstWindow();
  page.setDefaultTimeout(15000);
  await expect(
    page.getByRole("heading", { name: "We couldn’t connect" }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByLabel("Language").selectOption("fr");
  await expect(
    page.getByRole("heading", { name: "Connexion impossible" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByRole("heading", { name: "Connexion impossible" }),
  ).toBeVisible({ timeout: 30000 });
  remote = await buildApp(
    prismaStore(db),
    readConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      APP_ORIGIN: "http://127.0.0.1:14311",
      WEB_DIST: resolve("apps/web/dist"),
    }),
  );
  await remote.listen({ host: "127.0.0.1", port: 14311 });
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible({ timeout: 30000 });
  await desktop.close();
  desktop = undefined;
  expect((await fetch("http://127.0.0.1:14311/health")).status).toBe(200);
  console.log(
    `${packaged ? "Packaged" : "Development"} Electron smoke checks passed: login, refresh, sidebar, menu, EN/FR persistence, preferences, logout, owned API shutdown, translated connection retry/recovery and remote server survival.`,
  );
} catch (error) {
  const page = desktop?.windows()[0];
  if (page) await page.screenshot({ path: ".runtime/desktop-failure.png" }).catch(() => {});
  throw error;
} finally {
  await desktop?.close();
  await remote?.close();
  await db.user.deleteMany({ where: { username } });
  await db.$disconnect();
}
