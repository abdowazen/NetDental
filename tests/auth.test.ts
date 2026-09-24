import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import type { User, Session } from "@prisma/client";
import { buildApp, passwordOptions, digest } from "../apps/api/src/app";
import { readConfig } from "../apps/api/src/config";
import type { Store } from "../apps/api/src/store";
import en from "../apps/web/src/locales/en.json";
import fr from "../apps/web/src/locales/fr.json";
import type { Patient } from "../packages/shared/src/patients";
import { screens } from "../packages/shared/src/access";
const patients = new Map<number, Patient>();
let patientId = 100000;
import {
  clinicDate,
  type Currency,
  type ExchangeRate,
} from "../packages/shared/src/currency";
let baseCurrency: Currency = "USD";
const rates = new Map<string, ExchangeRate>();
const origin = "http://127.0.0.1:4310";
const headers = { origin, "x-clinic-request": "1" };
const users = new Map<string, User>();
const sessions = new Map<string, Session>();
let passwordHash = "";
const password = "test-only-long-password";
const store: Store = {
  async getChart() { return { dentition: null, toothEvents: [], findings: [], treatments: [] }; },
  async saveDentition() {},
  async createPlan() {},
  async editTreatment() {},
  async savePlanTotal() {},
  async addClinicalRecord() {},
  async voidClinicalRecord() {},
  async addTreatment() {},
  async changeTreatment() {},
  async voidTreatment() {},
  async searchProcedures() { return { procedures: [], total: 0 }; },
  async findProcedure() { return null; },
  async createProcedure() { throw new Error("Unused test method"); },
  async updateProcedure() { return null; },
  async setProcedureActive() { return null; },
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
  async listManagedUsers() {
    return [];
  },
  async saveManagedUser() {
    throw new Error("Unused test method");
  },
  async listClinics() {
    return [];
  },
  async saveClinic() {},
  async saveRoom() {},
  async searchPatients({ q, cursor }) {
    const rows = [...patients.values()]
      .filter(
        (p) =>
          (!cursor || p.id < cursor) &&
          [p.fileId, p.fullName, p.phone].some((value) =>
            value.toLowerCase().includes(q.toLowerCase()),
          ),
      )
      .sort((a, b) => b.id - a.id);
    return {
      total: rows.length,
      patients: rows.slice(0, 30),
      nextCursor: rows.length > 30 ? rows[29].id : null,
    };
  },
  async findPatient(id) {
    return patients.get(id) ?? null;
  },
  async createPatient(input) {
    const id = patientId++;
    const patient = {
      ...input,
      id,
      fileId: String(id),
      fullName: `${input.firstName} ${input.lastName}`,
    };
    patients.set(id, patient);
    return patient;
  },
  async updatePatient(id, input) {
    if (!patients.has(id)) return null;
    const patient = {
      ...input,
      id,
      fileId: String(id),
      fullName: `${input.firstName} ${input.lastName}`,
    };
    patients.set(id, patient);
    return patient;
  },
  async deletePatient(id) {
    return patients.delete(id);
  },
  async getBaseCurrency() {
    return baseCurrency;
  },
  async setBaseCurrency(currency) {
    baseCurrency = currency;
  },
  async listExchangeRates(year) {
    return [...rates.values()].filter((rate) => rate.date.startsWith(year));
  },
  async saveExchangeRate(rate) {
    rates.set(rate.date, rate);
  },
  async health() {},
  async findUser(username) {
    return [...users.values()].find((u) => u.username === username) ?? null;
  },
  async createUser(data) {
    const user: User = {
      ...data,
      id: randomUUID(),
      role: "DENTIST",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.set(user.id, user);
    return user;
  },
  async createSession(data) {
    sessions.set(data.tokenHash, {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
    });
  },
  async findSession(tokenHash) {
    const session = sessions.get(tokenHash);
    return session ? { ...session, user: users.get(session.userId)! } : null;
  },
  async deleteSession(tokenHash) {
    sessions.delete(tokenHash);
  },
  async clearExpired() {
    for (const [key, s] of sessions)
      if (s.expiresAt <= new Date()) sessions.delete(key);
  },
  async updateLanguage(id, preferredLanguage) {
    const user = { ...users.get(id)!, preferredLanguage };
    users.set(id, user);
    return user;
  },
};
const config = readConfig({
  DATABASE_URL: "postgresql://unused/test",
  APP_ORIGIN: origin,
});
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  passwordHash = await hash(password, passwordOptions);
  app = await buildApp(store, config);
});
beforeEach(async () => {
  patients.clear();
  baseCurrency = "USD";
  rates.clear();
  users.clear();
  sessions.clear();
  await store.createUser({
    username: "dentist",
    passwordHash,
    displayName: "Test Dentist",
    preferredLanguage: "en",
  });
});
afterAll(async () => {
  await app.close();
});
let ip = 0;
const login = (payload = { username: "Dentist", password }) =>
  app.inject({
    method: "POST",
    url: "/auth/login",
    headers,
    payload,
    remoteAddress: `127.0.1.${++ip}`,
  });
const cookieOf = (r: { headers: Record<string, unknown> }) =>
  String(r.headers["set-cookie"]).split(";")[0];
describe("session authentication", () => {
  it("protects every patient endpoint and validates required fields and read-only IDs", async () => {
    for (const method of ["GET", "POST", "PUT", "DELETE"] as const) {
      const url =
        method === "PUT" || method === "DELETE"
          ? "/api/patients/100000"
          : "/api/patients";
      expect((await app.inject({ method, url, headers })).statusCode).toBe(401);
    }
    const cookie = cookieOf(await login());
    const payload = {
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "01234567",
      gender: "Female",
    };
    for (const invalid of [
      { ...payload, firstName: " " },
      { ...payload, lastName: "" },
      { ...payload, phone: "" },
      { ...payload, gender: "Other" },
      { ...payload, age: -1 },
      { ...payload, age: 2.5 },
      { ...payload, firstVisit: "2026-02-30" },
      { ...payload, id: 123 },
      { ...payload, fullName: "Fake" },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/patients",
            headers: { ...headers, cookie },
            payload: invalid,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/patients",
          headers: { cookie },
          payload,
        })
      ).statusCode,
    ).toBe(403);
  });
  it("creates, searches, updates and deletes patients with stable file IDs", async () => {
    const cookie = cookieOf(await login());
    const h = { ...headers, cookie };
    const response = await app.inject({
      method: "POST",
      url: "/api/patients",
      headers: h,
      payload: {
        firstName: " Ada ",
        lastName: "Lovelace",
        phone: "+961 70 123456",
        gender: "Female",
      },
    });
    expect(response.statusCode).toBe(201);
    const patient = response.json().patient;
    expect(patient.fileId).toMatch(/^\d{6,}$/);
    expect(patient.fullName).toBe("Ada Lovelace");
    expect(patient.age).toBe(0);
    expect(patient.job).toBe("none");
    expect(patient.firstVisit).toBe(clinicDate());
    for (const q of ["ADA LOVE", "lovelace", "123 456", patient.fileId]) {
      expect(
        (
          await app.inject({
            url: `/api/patients?q=${encodeURIComponent(q)}`,
            headers: h,
          })
        ).json().patients[0].id,
      ).toBe(patient.id);
    }
    const { id, fileId, fullName, ...input } = patient;
    expect(fileId).toBe(String(id));
    expect(fullName).toBe("Ada Lovelace");
    expect(
      (
        await app.inject({
          method: "PUT",
          url: `/api/patients/${id}`,
          headers: h,
          payload: { ...input, lastName: "Byron" },
        })
      ).json().patient.fullName,
    ).toBe("Ada Byron");
    expect(
      (await app.inject({ url: `/api/patients/${id}`, headers: h })).json()
        .patient.fileId,
    ).toBe(fileId);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/patients/${id}`,
          headers: h,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: `/api/patients/${id}`, headers: h })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: "/api/patients?q=absent", headers: h })).json()
        .patients,
    ).toEqual([]);
  });
  it("protects currency settings and rate writes", async () => {
    expect((await app.inject({ url: "/currencies" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/currencies/rates",
          headers,
          payload: { date: clinicDate(), lbpPerUsd: "90000" },
        })
      ).statusCode,
    ).toBe(401);
    const cookie = cookieOf(await login());
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/currencies",
          headers: { cookie },
          payload: { baseCurrency: "LBP" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("persists clinic currency and daily rates, preferring today over fallback", async () => {
    const cookie = cookieOf(await login());
    const h = { ...headers, cookie };
    const today = clinicDate();
    const start = `${today.slice(0, 4)}-01-01`;
    expect(
      (await app.inject({ url: "/currencies", headers: h })).json()
        .effectiveRate,
    ).toBeNull();
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/currencies",
          headers: h,
          payload: { baseCurrency: "LBP" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/currencies/rates",
          headers: h,
          payload: { date: start, lbpPerUsd: "89000" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/currencies", headers: h })).json()
        .effectiveRate.date,
    ).toBe(start);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/currencies/rates",
          headers: h,
          payload: { date: today, lbpPerUsd: "90000.5" },
        })
      ).statusCode,
    ).toBe(200);
    const state = (await app.inject({ url: "/currencies", headers: h })).json();
    expect(state.baseCurrency).toBe("LBP");
    expect(state.effectiveRate).toEqual({ date: today, lbpPerUsd: "90000.5" });
    await app.inject({
      method: "PUT",
      url: "/currencies/rates",
      headers: h,
      payload: { date: today, lbpPerUsd: "91000" },
    });
    expect(
      (await app.inject({ url: "/currencies", headers: h })).json()
        .effectiveRate.lbpPerUsd,
    ).toBe("91000");
  });
  it("rejects unsupported currencies, invalid dates, future dates and invalid rates", async () => {
    const cookie = cookieOf(await login());
    const h = { ...headers, cookie };
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/currencies",
          headers: h,
          payload: { baseCurrency: "EUR" },
        })
      ).statusCode,
    ).toBe(400);
    for (const payload of [
      { date: "2026-02-30", lbpPerUsd: "90000" },
      { date: "9999-01-01", lbpPerUsd: "90000" },
      ...["0", "-1", "NaN", "1.0000001", "1000000000000"].map((lbpPerUsd) => ({
        date: clinicDate(),
        lbpPerUsd,
      })),
    ])
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/currencies/rates",
            headers: h,
            payload,
          })
        ).statusCode,
      ).toBe(400);
  });
  it("normalizes usernames, hashes session tokens and restores the session", async () => {
    const response = await login();
    expect(response.statusCode).toBe(200);
    expect(response.json().user.username).toBe("dentist");
    expect(response.json().user.passwordHash).toBeUndefined();
    const cookie = cookieOf(response);
    const raw = cookie.split("=")[1];
    expect(sessions.has(digest(raw))).toBe(true);
    expect(sessions.has(raw)).toBe(false);
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Strict");
    expect(
      (await app.inject({ url: "/auth/me", headers: { cookie } })).json().user
        .displayName,
    ).toBe("Test Dentist");
  });
  it("uses the same generic error for wrong passwords, unknown and inactive users", async () => {
    for (const payload of [
      { username: "dentist", password: "wrong" },
      { username: "unknown", password },
    ]) {
      const r = await login(payload);
      expect(r.statusCode).toBe(401);
      expect(r.json().error.code).toBe("INVALID_CREDENTIALS");
    }
    users.values().next().value!.isActive = false;
    const r = await login();
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe("INVALID_CREDENTIALS");
    expect(sessions.size).toBe(0);
  });
  it("rejects unauthenticated requests and malformed input", async () => {
    expect((await app.inject({ url: "/auth/me" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/users/me/preferences",
          headers,
          payload: { preferredLanguage: "fr" },
        })
      ).statusCode,
    ).toBe(401);
    expect((await login({ username: "!", password: "" })).statusCode).toBe(400);
  });
  it("invalidates the server session at logout", async () => {
    const cookie = cookieOf(await login());
    const r = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { ...headers, cookie },
    });
    expect(r.statusCode).toBe(204);
    expect(sessions.size).toBe(0);
    expect(r.headers["set-cookie"]).toContain("Expires=Thu, 01 Jan 1970");
    expect(
      (await app.inject({ url: "/auth/me", headers: { cookie } })).statusCode,
    ).toBe(401);
  });
  it("persists language and validates supported locales", async () => {
    const cookie = cookieOf(await login());
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/users/me/preferences",
          headers: { ...headers, cookie },
          payload: { preferredLanguage: "fr" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/auth/me", headers: { cookie } })).json().user
        .preferredLanguage,
    ).toBe("fr");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: "/users/me/preferences",
          headers: { ...headers, cookie },
          payload: { preferredLanguage: "de" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("rejects cross-origin requests and requests without a CSRF header", async () => {
    for (const requestHeaders of [
      { origin: "https://attacker.example", "x-clinic-request": "1" },
      { origin },
    ])
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/auth/login",
            headers: requestHeaders,
            payload: { username: "dentist", password },
          })
        ).statusCode,
      ).toBe(403);
  });
  it("invalidates expired sessions and sessions of deactivated users", async () => {
    const cookie = cookieOf(await login());
    sessions.values().next().value!.expiresAt = new Date(0);
    expect(
      (await app.inject({ url: "/auth/me", headers: { cookie } })).statusCode,
    ).toBe(401);
    expect(sessions.size).toBe(0);
    const cookie2 = cookieOf(await login());
    users.values().next().value!.isActive = false;
    expect(
      (await app.inject({ url: "/auth/me", headers: { cookie: cookie2 } }))
        .statusCode,
    ).toBe(401);
  });
  it("rate limits login attempts", async () => {
    const requests = () =>
      app.inject({
        method: "POST",
        url: "/auth/login",
        headers,
        payload: { username: "!", password: "" },
        remoteAddress: "10.0.0.42",
      });
    for (let i = 0; i < 10; i++) await requests();
    const r = await requests();
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe("RATE_LIMITED");
  });
  it("requires secure cookies on HTTPS and HTTPS outside loopback", () => {
    expect(() =>
      readConfig({ DATABASE_URL: "x", APP_ORIGIN: "https://clinic.example" }),
    ).toThrow();
    expect(() =>
      readConfig({ DATABASE_URL: "x", APP_ORIGIN: "http://clinic.example" }),
    ).toThrow();
  });
  it("has complete and matching English/French resources", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    expect(Object.values(fr).every(Boolean)).toBe(true);
  });
});
