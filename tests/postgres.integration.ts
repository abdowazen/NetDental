import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../apps/api/src/app";
import { readConfig } from "../apps/api/src/config";
import { prismaStore } from "../apps/api/src/store";
const db = new PrismaClient();
const username = `test_${randomUUID()}`;
const password = randomUUID() + randomUUID();
const origin = "http://127.0.0.1:4310";
const headers = { origin, "x-clinic-request": "1" };
const app = await buildApp(
  prismaStore(db),
  readConfig({ ...process.env, APP_ORIGIN: origin, COOKIE_SECURE: "false" }),
);
try {
  const create = () =>
    spawnSync(
      process.execPath,
      ["--import", "tsx", "apps/api/src/create-dentist.ts"],
      {
        env: {
          ...process.env,
          DENTIST_USERNAME: username,
          DENTIST_PASSWORD: password,
          DENTIST_DISPLAY_NAME: "Integration Dentist",
          DENTIST_LANGUAGE: "en",
        },
        encoding: "utf8",
      },
    );
  assert.equal(create().status, 0, "First-dentist CLI succeeds");
  assert.notEqual(create().status, 0, "Duplicate creation refused");
  assert.equal((await app.inject({ url: "/health" })).statusCode, 200);
  assert.equal((await app.inject({ url: "/auth/me" })).statusCode, 401);
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers,
    payload: { username, password },
  });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  assert.equal(
    (await app.inject({ url: "/auth/me", headers: { cookie } })).statusCode,
    200,
  );
  assert.equal(
    (
      await app.inject({
        method: "PATCH",
        url: "/users/me/preferences",
        headers: { ...headers, cookie },
        payload: { preferredLanguage: "fr" },
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { username } }))
      .preferredLanguage,
    "fr",
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: { ...headers, cookie },
      })
    ).statusCode,
    204,
  );
  assert.equal(
    (await app.inject({ url: "/auth/me", headers: { cookie } })).statusCode,
    401,
  );
  await db.user.update({ where: { username }, data: { isActive: false } });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/auth/login",
        headers,
        payload: { username, password },
      })
    ).statusCode,
    401,
  );
  console.log(
    "PostgreSQL integration checks passed (CLI, auth, session restoration, preferences, logout, inactive user).",
  );
} finally {
  await app.close();
  await db.user.deleteMany({ where: { username } });
  await db.$disconnect();
}
