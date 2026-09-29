import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { clinicDate } from "../packages/shared/src/currency";

export async function checkPatientFiles(app: FastifyInstance, db: PrismaClient, patientId: number, headers: Record<string,string>, otherRoom: number, deniedHeaders: Record<string,string>) {
  const base = `/api/patient-files/${patientId}`;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const search = new URLSearchParams({ originalName: "tooth-16.png", kind: "xray", mimeType: "image/png", tooth: "16", date: clinicDate(), description: "Periapical image" });
  const uploaded = await app.inject({ method: "POST", url: `${base}?${search}`, headers: { ...headers, "content-type": "application/octet-stream" }, payload: png });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const file = uploaded.json().file;
  assert.equal(file.originalName, "tooth-16.png");
  assert.equal(file.tooth, 16);
  const list = await app.inject({ url: base, headers });
  assert.equal(list.statusCode, 200);
  assert.equal(list.json().files.length, 1);
  const content = await app.inject({ url: `${base}/${file.id}/content`, headers });
  assert.equal(content.statusCode, 200);
  assert.equal(content.headers["content-type"], "image/png");
  assert.deepEqual(content.rawPayload, png);
  assert.equal((await app.inject({ url: base, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ url: base, headers: deniedHeaders })).statusCode, 403);
  const bad = new URLSearchParams(search); bad.set("mimeType", "image/jpeg");
  assert.equal((await app.inject({ method: "POST", url: `${base}?${bad}`, headers: { ...headers, "content-type": "application/octet-stream" }, payload: png })).statusCode, 400);
  const disposableParams = new URLSearchParams(search); disposableParams.set("originalName", "delete-me.png"); disposableParams.set("kind", "photo");
  const disposable = (await app.inject({ method: "POST", url: `${base}?${disposableParams}`, headers: { ...headers, "content-type": "application/octet-stream" }, payload: png })).json().file;
  assert.equal((await app.inject({ method: "DELETE", url: `${base}/${disposable.id}`, headers: deniedHeaders })).statusCode, 403);
  assert.equal((await app.inject({ method: "DELETE", url: `${base}/${disposable.id}`, headers })).statusCode, 204);
  assert.equal((await app.inject({ url: `${base}/${disposable.id}/content`, headers })).statusCode, 404);
  assert.equal(await db.patientFile.count({ where: { patientId } }), 1);
  console.log("Patient file checks passed: upload, preview retrieval, signature validation, permission-checked deletion and room isolation.");
}
