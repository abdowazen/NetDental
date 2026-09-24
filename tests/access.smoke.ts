import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { chromium, expect } from "@playwright/test";
import { buildApp, passwordOptions } from "../apps/api/src/app";
import { prismaStore } from "../apps/api/src/store";
import { readConfig } from "../apps/api/src/config";
import { checkOdontogram } from "./odontogram.checks";
import {
  clinicDate,
  type ManagedUserInput,
} from "../packages/shared/src/index";

const schema = `access_check_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", schema);
url.searchParams.set("connection_limit", "4");
const adminDb = new PrismaClient();
const db = new PrismaClient({ datasourceUrl: url.toString() });
const origin = "http://127.0.0.1:14321";
const headers = { origin, "x-clinic-request": "1" };
const app = await buildApp(
  prismaStore(db),
  readConfig({
    DATABASE_URL: url.toString(),
    APP_ORIGIN: origin,
    WEB_DIST: resolve("apps/web/dist"),
  }),
);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await adminDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const root = "apps/api/prisma/migrations";
  for (const folder of (await readdir(root))
    .filter((f) => /^\d/.test(f))
    .sort()) {
    const sql = await readFile(`${root}/${folder}/migration.sql`, "utf8");
    for (const statement of sql
      .replace(/^\s*--[^\r\n]*/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (statement.startsWith("CREATE EXTENSION")) continue;
      await db.$executeRawUnsafe(
        statement.replaceAll("gin_trgm_ops", "public.gin_trgm_ops"),
      );
    }
  }
  const password = "Test-only-Password-123";
  const admin = await db.user.create({
    data: {
      username: "testadmin",
      displayName: "Test Admin",
      role: "ADMIN",
      passwordHash: await hash(password, passwordOptions),
    },
  });
  const login = async (username: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers,
      payload: { username, password },
    });
    assert.equal(response.statusCode, 200, response.body);
    return String(response.headers["set-cookie"]).split(";")[0];
  };
  const cookie = await login("testadmin");
  const ah = { ...headers, cookie };
  const clinic = await db.clinic.create({ data: { name: "Second Clinic" } });
  const room = await db.surgicalRoom.create({
    data: { name: "Second Room", clinicId: clinic.id },
  });
  let staff: ManagedUserInput = {
    username: "staffuser",
    displayName: "Staff User",
    role: "DENTIST",
    isActive: true,
    roomIds: [1],
    permissions: [
      {
        screen: "patients",
        view: true,
        create: false,
        modify: false,
        delete: false,
      },
    ],
    password,
  };
  const created = await app.inject({
    method: "POST",
    url: "/api/admin/users",
    headers: ah,
    payload: staff,
  });
  assert.equal(created.statusCode, 201, created.body);
  const staffId = created.json().id;
  for (const role of ["ASSISTANT", "RECEPTIONIST"] as const) {
    const username = role.toLowerCase();
    const result = await app.inject({
      method: "POST",
      url: "/api/admin/users",
      headers: ah,
      payload: { ...staff, username, role },
    });
    assert.equal(result.statusCode, 201, result.body);
    const roleCookie = await login(username);
    const roleHeaders = { ...headers, cookie: roleCookie, "x-clinic-room": "1" };
    const patients = await app.inject({ url: "/api/patients", headers: roleHeaders });
    assert.equal(patients.statusCode, 200, patients.body);
    const forbidden = await app.inject({ url: "/api/admin/users", headers: roleHeaders });
    assert.equal(forbidden.statusCode, 403);
    const write = await app.inject({ method: "POST", url: "/api/patients", headers: roleHeaders, payload: {} });
    assert.equal(write.statusCode, 403);
  }
  const staffCookie = await login("staffuser");
  const sh = { ...headers, cookie: staffCookie, "x-clinic-room": "1" };
  const patientInput = {
    firstName: "RoomOne",
    lastName: "Patient",
    phone: "03123456",
    gender: "Female",
  };
  const patientResponse = await app.inject({
    method: "POST",
    url: "/api/patients",
    headers: { ...ah, "x-clinic-room": "1" },
    payload: patientInput,
  });
  assert.equal(patientResponse.statusCode, 201, patientResponse.body);
  const patient = patientResponse.json().patient;
  const otherResponse = await app.inject({
    method: "POST",
    url: "/api/patients",
    headers: { ...ah, "x-clinic-room": String(room.id) },
    payload: { ...patientInput, firstName: "RoomTwo" },
  });
  assert.equal(otherResponse.statusCode, 201, otherResponse.body);
  const other = otherResponse.json().patient;
  assert.equal(
    (await app.inject({ url: "/api/admin/users", headers: sh })).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: "/api/patients", headers: sh })).json().patients
      .length,
    1,
  );
  assert.equal(
    (await app.inject({ url: `/api/patients/${other.id}`, headers: sh }))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/patients",
        headers: { ...sh, "x-clinic-room": String(room.id) },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/patients",
        headers: sh,
        payload: patientInput,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/patients/${patient.id}`,
        headers: sh,
        payload: patientInput,
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "DELETE",
        url: `/api/patients/${patient.id}`,
        headers: sh,
      })
    ).statusCode,
    403,
  );
  const { password: unused, ...withoutPassword } = staff;
  assert.ok(unused);
  staff = {
    ...withoutPassword,
    roomIds: [1, room.id],
    permissions: [
      {
        screen: "patients",
        view: true,
        create: true,
        modify: true,
        delete: false,
      },
    ],
  };
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/admin/users/${staffId}`,
        headers: ah,
        payload: staff,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/patients",
        headers: { cookie: staffCookie },
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/patients/${other.id}`,
        headers: sh,
        payload: patientInput,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/patients/${patient.id}`,
        headers: sh,
        payload: patientInput,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: "/currencies/rates",
        headers: { ...ah, "x-clinic-room": "1" },
        payload: { date: clinicDate(), lbpPerUsd: "90000" },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        url: "/currencies",
        headers: { ...ah, "x-clinic-room": String(room.id) },
      })
    ).json().effectiveRate,
    null,
  );
  assert.equal(
    (await app.inject({ url: "/currencies", headers: sh })).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "PUT",
        url: `/api/admin/users/${admin.id}`,
        headers: ah,
        payload: {
          ...staff,
          username: "testadmin",
          role: "ADMIN",
          isActive: false,
        },
      })
    ).statusCode,
    409,
  );
  await app.listen({ host: "127.0.0.1", port: 14321 });
  const procedureInput = {
    code: " exam ", name: "Examination", category: "consultation_diagnosis",
    description: "Initial examination", defaultPrice: "25.50", dentition: "both",
    scope: "whole_mouth", requiresLab: false, chartIndicator: "generic", active: true,
  };
  const procedureHeaders = { ...ah, "x-clinic-room": "1" };
  const procedureCreated = await app.inject({ method: "POST", url: "/api/procedures", headers: procedureHeaders, payload: procedureInput });
  assert.equal(procedureCreated.statusCode, 201, procedureCreated.body);
  const procedureId = procedureCreated.json().procedure.id;
  assert.equal(procedureCreated.json().procedure.code, "EXAM");
  assert.equal(procedureCreated.json().procedure.defaultPrice, "25.50");
  assert.equal((await app.inject({ method: "POST", url: "/api/procedures", headers: procedureHeaders, payload: { ...procedureInput, code: "EXAM" } })).statusCode, 409);
  assert.equal((await app.inject({ method: "POST", url: "/api/procedures", headers: procedureHeaders, payload: { ...procedureInput, code: "NEGATIVE", defaultPrice: "-1" } })).statusCode, 400);
  assert.equal((await app.inject({ url: `/api/procedures/${procedureId}`, headers: { ...ah, "x-clinic-room": String(room.id) } })).statusCode, 404);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/procedures/${procedureId}/status`, headers: { ...ah, "x-clinic-room": String(room.id) }, payload: { active: false } })).statusCode, 404);
  assert.equal((await app.inject({ url: "/api/procedures", headers: sh })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/procedures", headers: sh, payload: procedureInput })).statusCode, 403);
  assert.equal((await app.inject({ method: "PATCH", url: `/api/procedures/${procedureId}/status`, headers: sh, payload: { active: false } })).statusCode, 403);
  const searchProcedures = await app.inject({ url: "/api/procedures?q=EXa&pageSize=1&sort=defaultPrice&direction=asc", headers: procedureHeaders });
  assert.equal(searchProcedures.json().total, 1);
  assert.equal(searchProcedures.json().procedures[0].id, procedureId);
  assert.equal((await app.inject({ url: "/api/procedures?q=%25", headers: procedureHeaders })).json().total, 0);
  assert.equal((await app.inject({ method: "PUT", url: `/api/procedures/${procedureId}`, headers: procedureHeaders, payload: { ...procedureInput, defaultPrice: "0" } })).json().procedure.defaultPrice, "0.00");
  assert.equal((await app.inject({ method: "PATCH", url: `/api/procedures/${procedureId}/status`, headers: procedureHeaders, payload: { active: false } })).json().procedure.active, false);
  await checkOdontogram(app, db, patient.id, 1, procedureHeaders, room.id, sh);
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1000 },
  });
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + "/")) externalRequests.push(new URL(request.url()).origin);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .context()
    .addCookies([
      { name: "clinic_session", value: cookie.split("=")[1], url: origin },
    ]);
  await page.goto(`${origin}/admin`);
  await page.getByLabel("Clinic", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Administration",
      exact: true,
      level: 2,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New user", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Screen permissions" }),
  ).toBeVisible();
  await page
    .getByLabel("New clinic name", { exact: true })
    .fill("Browser Clinic");
  await page
    .getByLabel("New clinic name", { exact: true })
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator('input[value="Browser Clinic"]')).toBeVisible();
  await page.getByRole("link", { name: "Treatment workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan estimate", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add session procedure", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add procedure", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Patient", exact: true }).fill("WalkIn");
  await page.getByRole("option", { name: /WalkIn Patient/ }).click();
  await expect(page.getByRole("tab", { name: "Sessions", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("row").filter({ hasText: "Test root canal" })).toHaveCount(1);
  await page.getByRole("tab", { name: "Plan & Chart", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit procedure", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Patient", exact: true }).fill("RoomOne");
  await page.getByRole("option", { name: /RoomOne Patient/ }).click();
  await expect(page.getByRole("link", { name: "View patient", exact: true })).toHaveAttribute("href", `/patients/${patient.id}`);
  await expect(page.getByRole("heading", { name: "Odontogram", exact: true })).toBeVisible();
  const picker = page.getByLabel("Tooth picker", { exact: true });
  await expect(page.getByLabel("Roots", { exact: true })).toBeChecked();
  await expect(page.getByLabel("Gums", { exact: true })).not.toBeChecked();
  await expect(page.getByLabel("Patient dentition", { exact: true })).toHaveCount(0);
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("combobox", { name: "View", exact: true }).selectOption("upper");
  await expect(picker.getByRole("button")).toHaveCount(16);
  await page.getByRole("combobox", { name: "View", exact: true }).selectOption("lower");
  await expect(picker.getByRole("button")).toHaveCount(16);
  await page.getByRole("button", { name: "Reset camera", exact: true }).click();
  await expect(picker.getByRole("button")).toHaveCount(32);
  await expect(page.getByText("Tooth state and treatment status are also shown as text.", { exact: false })).toHaveCount(0);
  await expect(picker.getByRole("button")).toHaveCount(32);
  await page.getByRole("group", { name: "Display", exact: true }).getByRole("button", { name: "Pediatric", exact: true }).click();
  await expect(picker.getByRole("button")).toHaveCount(20);
  await page.getByRole("group", { name: "Display", exact: true }).getByRole("button", { name: "Mixed", exact: true }).click();
  await expect(picker.getByRole("button")).toHaveCount(52);
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({ path: "test-artifacts/odontogram.png", fullPage: true });
  const chartBounds = await page.getByRole("heading", { name: "Odontogram", exact: true }).locator("xpath=ancestor::section[1]").boundingBox();
  const planBounds = await page.getByRole("heading", { name: "Treatment plan", exact: true }).locator("xpath=ancestor::section[1]").boundingBox();
  assert.ok(chartBounds && planBounds && Math.abs(chartBounds.height - planBounds.height) < 2);
  assert.equal(await picker.locator(".grid").evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth + 1)), true);
  await picker.getByRole("button", { name: /^Tooth 55 / }).click();
  await expect(page.getByRole("status").filter({ hasText: "Selected teeth: 55" })).toBeVisible();
  await page.getByLabel("Multi-select", { exact: true }).check();
  await picker.getByRole("button", { name: /^Tooth 15 / }).click();
  await expect(page.getByRole("status").filter({ hasText: "Selected teeth: 55, 15" })).toBeVisible();
  await page.getByRole("group", { name: "Display", exact: true }).getByRole("button", { name: "Adult", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Selected teeth: 55, 15" })).toBeVisible();
  await page.getByRole("button", { name: "Clear selection", exact: true }).click();
  await picker.getByRole("button", { name: /^Tooth 16 / }).click();
  await expect(page.getByRole("button", { name: "Add procedure", exact: true })).toBeDisabled();
  await page.getByRole("combobox", { name: "Procedure", exact: true }).fill("RCTX");
  await page.getByRole("option", { name: /RCTX/ }).click();
  await expect(page.getByLabel("Procedure category indicators", { exact: true })).toContainText("Endodontics");
  await expect(page.getByText("Procedure preview — save to add it to the treatment plan.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add procedure", exact: true }).click();
  await expect(page.getByLabel("Record type", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Procedure category indicators", { exact: true })).toContainText("Endodontics");
  await expect(page.getByRole("combobox", { name: "Procedure", exact: true })).toHaveValue("");
  await page.getByRole("combobox", { name: "Procedure", exact: true }).fill("RCTX");
  await page.getByRole("option", { name: /RCTX/ }).click();
  await picker.getByRole("button", { name: /^Tooth 17 / }).click();
  await expect(page.getByRole("combobox", { name: "Procedure", exact: true })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Add procedure", exact: true })).toHaveCount(0);
  const firstPlanRow = page.getByRole("row").filter({ hasText: "Test root canal" }).first();
  await firstPlanRow.getByRole("button", { name: "Edit procedure", exact: true }).click();
  await page.locator("#plan-row-discount-amount").fill("10.25");
  await page.locator("#plan-row-notes").fill("Adjusted estimate");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(firstPlanRow).toContainText("89.75 USD");
  await expect(firstPlanRow).toContainText("Adjusted estimate");
  await page.getByRole("button", { name: "Edit plan discount", exact: true }).click();
  await page.locator("#plan-discount-percent").fill("10");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("170.77 USD", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel("Clinic", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: "Treatment workspace", exact: true }).click();
  await page.getByRole("combobox", { name: "Patient", exact: true }).fill("RoomOne");
  await page.getByRole("option", { name: /RoomOne Patient/ }).click();
  await expect(page.getByText("170.77 USD", { exact: true })).toBeVisible();
  await firstPlanRow.getByRole("button", { name: "Delete procedure", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Adjusted estimate", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit plan discount", exact: true }).click();
  await page.getByRole("button", { name: "Remove plan discount", exact: true }).click();
  await expect(page.getByText("Plan discount (10.00%)", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New Plan", exact: true }).click();
  await expect(page.getByText("Plan 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit procedure", exact: true })).toHaveCount(0);
  await picker.getByRole("button", { name: /^Tooth 16 / }).click();
  await page.getByRole("combobox", { name: "Procedure", exact: true }).fill("RCTX");
  await page.getByRole("option", { name: /RCTX/ }).click();
  await page.getByRole("button", { name: "Add procedure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit procedure", exact: true })).toHaveCount(1);
  await page.reload();
  await page.getByLabel("Clinic", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: "Treatment workspace", exact: true }).click();
  await page.getByRole("combobox", { name: "Patient", exact: true }).fill("RoomOne");
  await page.getByRole("option", { name: /RoomOne Patient/ }).click();
  await expect(page.getByText("Plan 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit procedure", exact: true })).toHaveCount(1);
  await page.getByRole("tab", { name: "Sessions", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Latest action", exact: true })).toHaveCount(0);
  await page.getByLabel("From date", { exact: true }).fill("2099-01-01");
  await expect(page.getByText("No matching treatment found.", { exact: true })).toBeVisible();
  await page.getByLabel("From date", { exact: true }).fill(clinicDate());
  await page.getByLabel("To date", { exact: true }).fill(clinicDate());
  await expect(page.getByRole("row").filter({ hasText: "Test root canal" })).toHaveCount(1);
  await page.getByLabel("Filter by tooth number or procedure", { exact: true }).fill("99");
  await expect(page.getByText("No matching treatment found.", { exact: true })).toBeVisible();
  await page.getByLabel("Filter by tooth number or procedure", { exact: true }).fill("16");
  await expect(page.getByRole("row").filter({ hasText: "Test root canal" })).toHaveCount(1);
  await page.getByLabel("Filter by tooth number or procedure", { exact: true }).fill("rctx");
  await page.getByRole("button", { name: "Filter status", exact: true }).click();
  await page.getByRole("checkbox", { name: "Completed", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(page.getByText("No matching treatment found.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filter status", exact: true }).click();
  await page.getByRole("checkbox", { name: "Planned", exact: true }).check();
  await page.keyboard.press("Escape");
  const sessionRow = page.getByRole("row").filter({ hasText: "Test root canal" });
  const heightBeforeMenu = (await sessionRow.boundingBox())!.height;
  await sessionRow.getByRole("button", { name: "Actions for Test root canal", exact: true }).click();
  assert.equal((await sessionRow.boundingBox())!.height, heightBeforeMenu);
  await page.getByRole("button", { name: "In progress", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("No matching treatment found.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Filter status", exact: true }).click();
  await page.getByRole("checkbox", { name: "In progress", exact: true }).check();
  await page.keyboard.press("Escape");
  await expect(sessionRow.locator("td").nth(3)).toHaveText("In progress");
  await page.getByRole("tab", { name: "Payments", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plan estimate", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Patient balance", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Odontogram", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Payments", exact: true }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Laboratory", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Plan & Chart", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Odontogram", exact: true })).toBeVisible();
  const fallbackPage = await browser.newPage();
  await fallbackPage.context().addCookies(await page.context().cookies());
  await fallbackPage.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof getContext>) {
      if (String(args[0]).startsWith("webgl") || String(args[0]).includes("experimental-webgl")) return null;
      return getContext.apply(this, args);
    } as typeof getContext;
  });
  await fallbackPage.goto(`${origin}/treatment`);
  await fallbackPage.getByLabel("Clinic", { exact: true }).selectOption("1");
  await fallbackPage.getByRole("button", { name: "Continue", exact: true }).click();
  await fallbackPage.getByRole("link", { name: "Treatment workspace", exact: true }).click();
  await expect(fallbackPage.getByText("3D rendering is unavailable.", { exact: false })).toBeVisible();
  await expect(fallbackPage.getByLabel("Tooth picker", { exact: true }).getByRole("button")).toHaveCount(32);
  await fallbackPage.close();
  await page.getByRole("link", { name: "Procedure Catalog", exact: true }).click();
  await page.getByRole("link", { name: "New Procedure", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("#code")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#defaultPrice")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Code", { exact: false }).fill("NEW-01");
  await page.getByLabel("Procedure name", { exact: false }).fill("Browser Procedure");
  await page.getByLabel("Default price (USD)", { exact: false }).fill("100.25");
  await page.getByLabel("Category", { exact: true }).selectOption("restorative_dentistry");
  await expect(page.getByLabel("Chart indicator", { exact: true })).toHaveValue("generic");
  await expect(page.getByLabel("Active", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Procedure saved.", { exact: true })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toContainText("NEW-01");
  await page.getByRole("button", { name: "Deactivate Browser Procedure", exact: true }).click();
  await expect(page.getByRole("button", { name: "Activate Browser Procedure", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Activate Browser Procedure", exact: true }).click();
  await page.getByRole("link", { name: "Edit Browser Procedure", exact: true }).click();
  await expect(page.locator("#defaultPrice")).toHaveValue("100.25");
  await page.locator("#code").fill("exam");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("This code already exists in the current clinic and room.", { exact: true })).toBeVisible();
  await page.locator("#code").fill("NEW-01");
  await page.locator("#description").fill("Updated description");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Search by code or procedure name", { exact: true }).fill("Browser");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Browser Procedure");
  await page.goto(`${origin}/patients`);
  await page.getByLabel("Clinic", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: "Patients Registration" }).click();
  await expect(
    page.getByText("RoomOne Patient", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Clinic", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Surgical room", { exact: true })).toHaveCount(0);
  await page.goto(`${origin}/login`);
  await page
    .getByLabel("Clinic", { exact: true })
    .selectOption(String(clinic.id));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("link", { name: "Patients Registration" }).click();
  await expect(
    page.getByText("RoomTwo Patient", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("RoomOne Patient", { exact: true })).toHaveCount(
    0,
  );
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([
      { name: "clinic_session", value: staffCookie.split("=")[1], url: origin },
    ]);
  await page.goto(`${origin}/patients`);
  await page.getByLabel("Clinic", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Administration", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete RoomOne Patient" }),
  ).toHaveCount(0);
  // One assigned clinic and room needs no selectors.
  const assistantCookie = await login("assistant");
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: "clinic_session", value: assistantCookie.split("=")[1], url: origin },
  ]);
  await page.goto(`${origin}/patients`);
  await expect(page.getByText("RoomOne Patient", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Clinic", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Surgical room", { exact: true })).toHaveCount(0);
  // Several rooms in one clinic show only the room selector.
  const additionalRoom = await db.surgicalRoom.create({ data: { name: "Extra Room", clinicId: 1 } });
  const assistant = await db.user.findUniqueOrThrow({ where: { username: "assistant" } });
  await db.roomAssignment.create({ data: { userId: assistant.id, roomId: additionalRoom.id } });
  await page.reload();
  await expect(page.getByLabel("Clinic", { exact: true })).toHaveCount(0);
  await page.getByLabel("Surgical room", { exact: true }).selectOption("1");
  await expect(page.getByText("RoomOne Patient", { exact: true })).toBeVisible();
  await page.getByLabel("Surgical room", { exact: true }).selectOption(String(additionalRoom.id));
  await expect(page.getByText("RoomOne Patient", { exact: true })).toHaveCount(0);
  staff = { ...staff, roomIds: [room.id], permissions: [] };
  await app.inject({
    method: "PUT",
    url: `/api/admin/users/${staffId}`,
    headers: ah,
    payload: staff,
  });
  assert.equal(
    (await app.inject({ url: "/api/patients", headers: sh })).statusCode,
    403,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], "The chart must work without remote assets");
  console.log(
    "Access checks passed: separate administrator, user management, permissions, cross-room isolation, currency isolation, immediate revocation, last-admin protection, browser clinic switching and admin UI.",
  );
} finally {
  await browser?.close();
  await app.close();
  await db.$disconnect();
  await adminDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminDb.$disconnect();
}
