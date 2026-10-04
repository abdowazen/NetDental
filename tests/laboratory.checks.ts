import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { clinicDate } from "../packages/shared/src/currency";

export async function checkLaboratory(app: FastifyInstance, db: PrismaClient, patientId: number, headers: Record<string,string>, otherRoom: number, staffHeaders: Record<string,string>) {
  const url = `/api/laboratory/${patientId}`;
  const treatment = await db.treatment.findFirstOrThrow({ where: { patientId, plan: { number: 2 }, voidReason: null } });
  await db.procedure.update({ where: { id: treatment.procedureId }, data: { labLaboratory: "Changed Lab", labDefaultCost: "99.00", labMaterial: "Changed after planning" } });
  const unchanged = await db.treatment.findUniqueOrThrow({ where: { id: treatment.id }, include: { events: true } });
  assert.equal(unchanged.status, "planned", "Creating a laboratory draft must not advance the treatment");
  assert.equal(unchanged.events.some((event) => event.status === "in_progress"), false);
  assert.equal((await app.inject({ method: "POST", url: `${url}/drafts`, headers, payload: { treatmentId: treatment.id, date: clinicDate() } })).statusCode, 409);
  let summary = (await app.inject({ url, headers })).json();
  assert.equal(summary.totalCost, "0.00", "Draft costs are excluded");
  const automatic = summary.requests.find((request: { treatmentId: string }) => request.treatmentId === treatment.id);
  assert.equal(automatic.status, "to_request");
  assert.equal(automatic.cost, "40.00");
  assert.equal(automatic.laboratory, "Cedar Lab");
  assert.equal(automatic.material, "Zirconia");
  const id = automatic.id;
  const details = { laboratory: "Cedar Lab", cost: "55", currency: "USD", material: "Zirconia", shade: "A2", instructions: "Use scan", requestDate: clinicDate(), dueDate: clinicDate() };
  assert.equal((await app.inject({ method: "PUT", url: `${url}/${id}`, headers, payload: details })).statusCode, 204);
  assert.equal((await app.inject({ method: "POST", url: `${url}/${id}/status`, headers, payload: { action: "requested", date: clinicDate() } })).statusCode, 204);
  summary = (await app.inject({ url, headers })).json();
  assert.equal(summary.totalCost, "55.00");
  assert.equal(summary.requests.find((request: { id: string }) => request.id === id).events.at(-1).action, "requested");
  const voidTreatment = await db.treatment.create({ data: { patientId, planId: treatment.planId, procedureId: treatment.procedureId,
    snapshot: { requiresLab: true, labLaboratory: "Voided Lab", labDefaultCost: "70.00", labTurnaroundDays: 2, code: "VOIDLAB", name: "Voided lab work", scope: "single_tooth" },
    price: "70.00", date: new Date(`${clinicDate()}T00:00:00Z`), notes: "", status: "planned",
    teeth: { create: { tooth: 17, surfaces: [], role: "target" } }, events: { create: { status: "planned", date: new Date(`${clinicDate()}T00:00:00Z`), notes: "", actorId: (await db.user.findFirstOrThrow()).id } } }, include: { events: true } });
  assert.equal((await app.inject({ method: "POST", url: `${url}/drafts`, headers, payload: { treatmentId: voidTreatment.id, date: clinicDate() } })).statusCode, 201);
  assert.equal((await app.inject({ method: "POST", url: `/api/odontogram/${patientId}/treatments/${voidTreatment.id}/void`, headers, payload: { reason: "Cancelled lab work", date: clinicDate() } })).statusCode, 204);
  summary = (await app.inject({ url, headers })).json();
  assert.equal(summary.requests.find((request: { treatmentId: string }) => request.treatmentId === voidTreatment.id).status, "voided");
  assert.equal(summary.totalCost, "55.00", "Voided laboratory costs are excluded");
  assert.equal((await app.inject({ url, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ url, headers: staffHeaders })).statusCode, 403);
  console.log("Laboratory API checks passed: automatic eligible-treatment drafts, preserved session status, defaults, dated request actions, totals and scope isolation.");
}
