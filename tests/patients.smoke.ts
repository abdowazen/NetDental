import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient, type User } from "@prisma/client";
import { chromium, expect } from "@playwright/test";
import { buildApp } from "../apps/api/src/app";
import { readConfig } from "../apps/api/src/config";
import { prismaStore } from "../apps/api/src/store";
import {
  screens,
  type PatientSearch,
  type PatientInput,
} from "../packages/shared/src/index";

// An isolated schema keeps all test records and sequences out of clinic data.
const schema = `patient_check_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.DATABASE_URL!);
const admin = new PrismaClient();
url.searchParams.set("schema", schema);
url.searchParams.set("connection_limit", "4");
const db = new PrismaClient({ datasourceUrl: url.toString() });
const scopedStore = prismaStore(db);
const store = {
  ...scopedStore,
  searchPatients: (input: PatientSearch) =>
    scopedStore.searchPatients(input, 1),
  createPatient: (input: PatientInput) => scopedStore.createPatient(input, 1),
  findPatient: (id: number) => scopedStore.findPatient(id, 1),
  updatePatient: (id: number, input: PatientInput) =>
    scopedStore.updatePatient(id, input, 1),
  deletePatient: (id: number) => scopedStore.deletePatient(id, 1),
  async accessFor() {
    return {
      rooms: [{ id: 1, name: "Room 1", clinicId: 1, clinicName: "Test" }],
      permissions: screens.map((screen) => ({
        screen,
        view: true,
        create: true,
        modify: true,
        delete: true,
      })),
    };
  },
};
const token = "a".repeat(64);
const user: User = {
  id: randomUUID(),
  username: "patient_test",
  displayName: "Patient Test",
  passwordHash: "unused",
  role: "DENTIST",
  preferredLanguage: "en",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const app = await buildApp(
  {
    ...store,
    async health() {},
    async findSession() {
      return {
        id: "test",
        userId: user.id,
        tokenHash: "unused",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        user,
      };
    },
  },
  readConfig({
    DATABASE_URL: url.toString(),
    APP_ORIGIN: "http://127.0.0.1:14320",
    WEB_DIST: resolve("apps/web/dist"),
  }),
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const migration = await readFile(
    "apps/api/prisma/migrations/20260923000000_patients/migration.sql",
    "utf8",
  );
  for (const sql of migration
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    if (sql.startsWith("CREATE EXTENSION")) continue;
    await db.$executeRawUnsafe(
      sql.replaceAll("gin_trgm_ops", "public.gin_trgm_ops"),
    );
  }
  await db.$executeRawUnsafe(
    'ALTER TABLE "Patient" ADD COLUMN "roomId" INTEGER NOT NULL DEFAULT 1',
  );
  const input = {
    firstName: "Search",
    lastName: "Fixture",
    phone: "0123%_45",
    gender: "Male" as const,
    fatherName: "",
    job: "none" as const,
    age: 0,
    firstVisit: "2026-01-01",
    notes: "",
  };
  const batch = await Promise.all(
    Array.from({ length: 32 }, (_, index) =>
      store.createPatient({ ...input, lastName: `Fixture${index}` }),
    ),
  );
  assert.equal(new Set(batch.map((p) => p.fileId)).size, 32);
  const first = await store.searchPatients({ q: "sEaRcH fiX" });
  assert.equal(first.total, 32);
  const sorted = await store.searchPatients({
    q: "Search",
    page: 2,
    pageSize: 10,
    sort: "id",
    direction: "asc",
    from: "2026-01-01",
    to: "2026-01-01",
  });
  assert.equal(sorted.patients.length, 10);
  assert.equal(sorted.total, 32);
  assert.equal(
    sorted.patients[0].id,
    [...batch].sort((a, b) => a.id - b.id)[10].id,
  );
  assert.equal(
    (await store.searchPatients({ q: "Search", from: "2026-01-02" })).total,
    0,
  );
  assert.equal(
    (await store.searchPatients({ q: "Search", to: "2025-12-31" })).total,
    0,
  );
  assert.equal(first.patients.length, 30);
  const second = await store.searchPatients({
    q: "search",
    cursor: first.nextCursor!,
  });
  assert.equal(second.patients.length, 2);
  assert.equal(
    new Set([...first.patients, ...second.patients].map((p) => p.id)).size,
    32,
  );
  assert.equal((await store.searchPatients({ q: "%_" })).patients.length, 30);
  assert.equal(
    (await store.searchPatients({ q: batch[0].fileId })).patients[0].id,
    batch[0].id,
  );
  assert.equal(
    (await store.searchPatients({ q: "' OR 1=1 --" })).patients.length,
    0,
  );
  for (const patient of batch) await store.deletePatient(patient.id);
  await app.listen({ host: "127.0.0.1", port: 14320 });
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .context()
    .addCookies([
      { name: "clinic_session", value: token, url: "http://127.0.0.1:14320" },
    ]);
  await page.goto("http://127.0.0.1:14320/patients");
  await expect(page.getByText("No patient found — create new?")).toBeVisible();
  await page
    .getByRole("link", { name: "New Patient", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Save patient", exact: true }).click();
  await expect(page.getByText("This field is required.")).toHaveCount(4);
  await page.getByLabel("First Name", { exact: false }).fill("Ada");
  await page.getByLabel("Last Name", { exact: false }).fill("Lovelace");
  await page
    .getByLabel("Phone / Mobile", { exact: false })
    .fill("+961 70 123456");
  await page.getByLabel("Gender", { exact: false }).selectOption("Female");
  await expect(page.getByLabel("Full Name", { exact: true })).toHaveValue(
    "Ada Lovelace",
  );
  await expect(page.getByLabel("Full Name", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await expect(page.getByLabel("Full Name", { exact: true })).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(
    page.getByLabel("Patient / File ID", { exact: true }),
  ).toHaveAttribute("tabindex", "-1");
  await expect(
    page.getByRole("button", { name: "Delete", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Save patient", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:14320/patients");
  await expect(page.getByRole("row").nth(1)).toContainText("Ada Lovelace");
  await page.getByRole("link", { name: "New Patient", exact: true }).click();
  await page.getByLabel("First Name", { exact: false }).fill("Grace");
  await page.getByLabel("Last Name", { exact: false }).fill("Hopper");
  await page.getByLabel("Phone / Mobile", { exact: false }).fill("7654321");
  await page.getByLabel("Gender", { exact: false }).selectOption("Female");
  await page.getByRole("button", { name: "Save patient", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText("Grace Hopper");
  await page.getByRole("button", { name: "Full Name", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText("Ada Lovelace");
  await page.getByRole("button", { name: "Full Name", exact: true }).click();
  await expect(page.getByRole("row").nth(1)).toContainText("Grace Hopper");
  await page.getByLabel("First Visit — To", { exact: true }).fill("2000-01-01");
  await expect(page.getByText("No patient found — create new?")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.getByRole("searchbox").fill("ADA LOVE");
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("row").nth(1)).toContainText("Ada Lovelace");
  await page.getByRole("link", { name: "Modify Ada Lovelace" }).click();
  await page.getByLabel("Last Name", { exact: false }).fill("Byron");
  await page.getByRole("button", { name: "Save patient", exact: true }).click();
  await expect(page.getByText("Ada Byron", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("Marie Curie");
  await expect(page.getByText("No patient found — create new?")).toBeVisible();
  await page
    .getByRole("link", { name: "New Patient", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("First Name", { exact: false })).toHaveValue(
    "Marie",
  );
  await expect(page.getByLabel("Last Name", { exact: false })).toHaveValue(
    "Curie",
  );
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete Ada Byron" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(page.getByText("Ada Byron", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Ada Byron" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.getByText("Ada Byron", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Modify Grace Hopper" }).click();
  await page.reload();
  await expect(page.getByLabel("First Name", { exact: false })).toHaveValue(
    "Grace",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Patient PostgreSQL and browser checks passed: unique IDs, partial and escaped search, pagination, validation, creation, newest-first listing, edit, prefill, delete confirmation and deep-link reload.",
  );
} finally {
  await browser?.close();
  await app.close();
  await db.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.$disconnect();
}
