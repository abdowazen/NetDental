import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { ChartData } from "../packages/shared/src/odontogram";

export async function checkOdontogram(app: FastifyInstance, db: PrismaClient, patientId: number, roomId: number, headers: Record<string, string>, otherRoom: number, staffHeaders: Record<string, string>) {
  const url = `/api/odontogram/${patientId}`;
  const chart = async () => {
    const response = await app.inject({ url, headers });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<ChartData>();
  };
  const write = async (path: string, payload: unknown, method: "POST" | "PUT" = "POST") => {
    const body = path === "/treatments" || path === "/plan-discount" ? { ...payload as object, planId: (await chart()).plan?.id ?? null } : payload;
    return app.inject({ url: url + path, headers, method, payload: body as object });
  };
  assert.equal((await chart()).dentition, null);
  assert.equal((await app.inject({ url, headers: { ...headers, "x-clinic-room": String(otherRoom) } })).statusCode, 404);
  assert.equal((await app.inject({ url, headers: staffHeaders })).statusCode, 403);
  assert.equal((await app.inject({ url: url + "/config", method: "PUT", headers: staffHeaders, payload: { dentition: "mixed" } })).statusCode, 403);
  assert.equal((await write("/config", { dentition: "mixed" }, "PUT")).statusCode, 204);
  const association = (tooth: number, surfaces: string[] = []) => ({ tooth, surfaces, role: "target" });
  const toothEvent = { tooth: 55, state: "retained_primary", date: "2026-01-01", notes: "Explicit dentist entry" };
  assert.equal((await write("/tooth-events", toothEvent)).statusCode, 201);
  assert.equal((await write("/tooth-events", { ...toothEvent, tooth: 15 })).statusCode, 400);
  const finding = { description: "Existing filling", teeth: [association(16, ["occlusal"])], date: "2026-01-01", notes: "" };
  assert.equal((await write("/findings", finding)).statusCode, 201);
  assert.equal((await chart()).treatments.length, 0, "Findings must not create treatments/charges");
  const cedarLab = await db.laboratory.create({ data: { roomId, name: "Cedar Lab", defaultCost: "40.00", turnaroundDays: 7, material: "Zirconia", shade: "A2", instructions: "Use scan" } });
  const p = await db.procedure.create({ data: { roomId, code: "RCTX", name: "Test root canal", category: "endodontics", defaultPrice: "100.00", dentition: "both", scope: "single_tooth", requiresLab: true } });
  await db.laboratoryProcedureRate.create({ data: { laboratoryId: cedarLab.id, procedureId: p.id, cost: "40.00", currency: "USD", turnaroundDays: 7 } });
  const input = { procedureId: p.id, laboratoryId: cedarLab.id, mode: "independent", teeth: [association(16)], date: "2026-02-01", notes: "", price: "100.00" };
  assert.equal((await write("/treatments", { ...input, laboratoryId: undefined })).statusCode, 400);
  assert.equal((await write("/treatments", { ...input, labMaterial: "Lithium disilicate", labShade: "A3", labInstructions: "Custom treatment instructions" })).statusCode, 201);
  const customizedLabRequest = await db.labRequest.findFirstOrThrow({ where: { patientId, treatment: { procedureId: p.id } }, orderBy: { createdAt: "desc" } });
  assert.equal(customizedLabRequest.material, "Lithium disilicate");
  assert.equal(customizedLabRequest.shade, "A3");
  assert.equal(customizedLabRequest.instructions, "Custom treatment instructions");
  assert.equal((await write("/treatments", { ...input, date: "2026-03-01" })).statusCode, 201);
  let data = await chart();
  assert.equal(data.treatments.length, 2);
  assert.notEqual(data.treatments[0].id, data.treatments[1].id);
  assert.equal((await write("/treatments", { ...input, teeth: [association(11, ["occlusal"])] })).statusCode, 400);
  assert.equal((await write("/treatments", { ...input, teeth: [association(19)] })).statusCode, 400);
  assert.equal((await write("/treatments", { ...input, teeth: [association(16), association(16)] })).statusCode, 400);
  assert.equal((await write("/treatments", { ...input, teeth: [association(16), association(17)] })).statusCode, 201);
  data = await chart();
  assert.equal(data.treatments.length, 4, "Independent mode creates one instance per tooth");
  const bridge = await db.procedure.create({ data: { roomId, code: "BRIDGE", name: "Bridge", category: "fixed_prosthodontics", defaultPrice: "900.00", dentition: "permanent", scope: "multiple_teeth" } });
  const bridgeInput = { ...input, procedureId: bridge.id, mode: "group", price: "900.00", teeth: [
    { ...association(14), role: "abutment" }, { ...association(15), role: "pontic" }, { ...association(16), role: "abutment" },
  ] };
  assert.equal((await write("/treatments", bridgeInput)).statusCode, 201);
  assert.equal((await write("/treatments", { ...bridgeInput, mode: "independent" })).statusCode, 400);
  assert.equal((await write("/treatments", { ...bridgeInput, teeth: [association(55), association(54)] })).statusCode, 400);
  const wholeMouth = await db.procedure.create({ data: { roomId, code: "WHOLE", name: "Whole-mouth procedure", category: "prevention_hygiene", defaultPrice: "50.00", dentition: "both", scope: "whole_mouth" } });
  assert.equal((await write("/treatments", { ...input, procedureId: wholeMouth.id, mode: "group", teeth: [], price: "50.00" })).statusCode, 201);
  data = await chart();
  const bridgeRecord = data.treatments.find((r) => r.procedureId === bridge.id)!;
  assert.equal(bridgeRecord.price, "900.00");
  assert.equal(bridgeRecord.category, "fixed_prosthodontics");
  assert.equal(bridgeRecord.teeth.length, 3);
  assert.equal(bridgeRecord.teeth.find((r) => r.tooth === 15)?.role, "pontic");
  assert.equal((await write("/treatments", { ...bridgeInput, teeth: [] })).statusCode, 201,
    "Multiple-teeth procedures can be planned without selecting teeth");
  assert.equal((await write("/treatments", { ...bridgeInput, teeth: [association(14)] })).statusCode, 400,
    "An explicit multiple-teeth association must contain at least two teeth");
  assert.ok((await chart()).treatments.some((record) => record.procedureId === bridge.id && record.teeth.length === 0));
  await db.procedure.update({ where: { id: bridge.id }, data: { name: "Changed name", defaultPrice: "1200", category: "other" } });
  assert.equal((await chart()).treatments.find((r) => r.id === bridgeRecord.id)?.category, "fixed_prosthodontics");
  assert.equal((await chart()).treatments.find((r) => r.id === bridgeRecord.id)?.price, "900.00");
  assert.equal((await chart()).treatments.find((r) => r.id === bridgeRecord.id)?.name, "Bridge");
  const r = data.treatments.find((r) => r.procedureId === p.id)!;
  const complete = { status: "completed", date: "2026-05-01", notes: "Executed", expectedVersion: r.version };
  const simultaneous = await Promise.all([
    write(`/treatments/${r.id}/status`, complete),
    write(`/treatments/${r.id}/status`, complete),
  ]);
  assert.deepEqual(simultaneous.map((r) => r.statusCode).sort(), [204, 409]);
  assert.equal((await write(`/treatments/${r.id}/status`, { ...complete, status: "planned", expectedVersion: 2 })).statusCode, 409);
  assert.equal((await write(`/treatments/${r.id}/void`, { reason: "", date: "2026-06-01" })).statusCode, 400);
  assert.equal((await write(`/treatments/${r.id}/void`, { reason: "Correction required", date: "2026-06-01" })).statusCode, 204);
  assert.equal((await write("/treatments", { ...input, replacesId: r.id, date: "2026-06-02" })).statusCode, 201);
  assert.equal((await chart()).treatments.find((t) => t.id === r.id)?.events.length, 3);
  assert.equal((await write("/config", { dentition: "adult" }, "PUT")).statusCode, 204);
  data = await chart();
  assert.equal(data.toothEvents[0].tooth, 55, "Configuration changes must not migrate primary identity");
  assert.equal(data.findings.length, 1);
  const foreignProcedure = await db.procedure.create({ data: { roomId: otherRoom, code: "FOREIGN", name: "Foreign", category: "other", defaultPrice: "10", dentition: "both", scope: "single_tooth" } });
  assert.equal((await write("/treatments", { ...input, procedureId: foreignProcedure.id })).statusCode, 404);
  assert.equal((await app.inject({ url: url + `/treatments/${bridgeRecord.id}/void`, method: "POST", headers: { ...headers, "x-clinic-room": String(otherRoom) }, payload: { reason: "Invalid room", date: "2026-06-01" } })).statusCode, 404);
  assert.equal((await write(`/clinical/${data.findings[0].id}/void`, { reason: "Incorrect finding", date: "2026-06-01" })).statusCode, 204);
  assert.equal((await chart()).findings.length, 1);
  const staff = await db.user.findUniqueOrThrow({ where: { username: "staffuser" } });
  await db.screenPermission.create({ data: { userId: staff.id, screen: "treatment", view: true } });
  assert.equal((await app.inject({ url, headers: staffHeaders })).statusCode, 200);
  assert.equal((await app.inject({ url: url + "/findings", method: "POST", headers: staffHeaders, payload: finding })).statusCode, 403);
  assert.equal((await app.inject({ url: url + `/treatments/${bridgeRecord.id}/void`, method: "POST", headers: staffHeaders, payload: { reason: "Denied", date: "2026-06-01" } })).statusCode, 403);
  const edit = { discount: { type: "amount", value: "49.75" }, date: bridgeRecord.date, notes: "Agreed price", expectedVersion: bridgeRecord.version };
  const editUrl = url + `/treatments/${bridgeRecord.id}`;
  assert.equal((await app.inject({ url: editUrl, method: "PUT", headers: staffHeaders, payload: edit })).statusCode, 403);
  assert.equal((await app.inject({ url: editUrl, method: "PUT", headers: { ...headers, "x-clinic-room": String(otherRoom) }, payload: edit })).statusCode, 404);
  assert.equal((await write(`/treatments/${bridgeRecord.id}`, { ...edit, discount: { type: "amount", value: "-1" } }, "PUT")).statusCode, 400);
  assert.equal((await write(`/treatments/${bridgeRecord.id}`, { ...edit, discount: { type: "amount", value: "900.01" } }, "PUT")).statusCode, 400);
  assert.equal((await write(`/treatments/${bridgeRecord.id}`, { ...edit, discount: { type: "percent", value: "100.01" } }, "PUT")).statusCode, 400);
  assert.equal((await write(`/treatments/${bridgeRecord.id}`, { ...edit, price: "1.00" }, "PUT")).statusCode, 400);
  assert.equal((await write(`/treatments/${bridgeRecord.id}`, edit, "PUT")).statusCode, 204);
  assert.equal((await write(`/treatments/${bridgeRecord.id}`, edit, "PUT")).statusCode, 409);
  const edited = (await chart()).treatments.find((t) => t.id === bridgeRecord.id)!;
  assert.equal(edited.price, "900.00");
  assert.equal(edited.discount?.value, "49.75");
  assert.equal(edited.teeth.length, 3);
  assert.ok(edited.events.some((e) => e.status === "edited" && e.notes.includes("900.00")));
  assert.equal((await write(`/treatments/${r.id}`, { ...edit, expectedVersion: 3 }, "PUT")).statusCode, 409);
  assert.equal((await app.inject({ url: url + "/plan-discount", method: "PUT", headers: staffHeaders, payload: { discount: { type: "percent", value: "20" }, expectedId: null } })).statusCode, 403);
  const totalWrites = await Promise.all([write("/plan-discount", { discount: { type: "percent", value: "20.50" }, expectedId: null }, "PUT"), write("/plan-discount", { discount: { type: "percent", value: "10" }, expectedId: null }, "PUT")]);
  assert.deepEqual(totalWrites.map((r) => r.statusCode).sort(), [204,409]);
  const totalSaved = (await chart()).planDiscount!;
  assert.equal((await write("/plan-discount", { discount: { type: "amount", value: "9999999" }, expectedId: totalSaved.id }, "PUT")).statusCode, 400);
  assert.ok(["20.50", "10.00"].includes(totalSaved.discount.value));
  assert.equal((await write("/plan-discount", { discount: { type: "amount", value: "0" }, expectedId: totalSaved.id }, "PUT")).statusCode, 204);
  assert.equal((await chart()).planDiscount?.discount.value, "0.00");
  assert.equal((await app.inject({ url: editUrl, method: "DELETE", headers: staffHeaders, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ url: editUrl, method: "DELETE", headers, payload: {} })).statusCode, 204);
  assert.equal((await chart()).historyTreatments?.some((t) => t.id === bridgeRecord.id), false);
  const oldPlan = (await chart()).plan!;
  const oldCount = await db.treatment.count({ where: { patientId, planId: oldPlan.id } });
  assert.equal((await app.inject({ url: url + "/plans", method: "POST", headers: staffHeaders, payload: { expectedPlanId: oldPlan.id } })).statusCode, 403);
  assert.equal((await app.inject({ url: url + "/plans", method: "POST", headers: { ...headers, "x-clinic-room": String(otherRoom) }, payload: { expectedPlanId: oldPlan.id } })).statusCode, 404);
  const planWrites = await Promise.all([write("/plans", { expectedPlanId: oldPlan.id }), write("/plans", { expectedPlanId: oldPlan.id })]);
  assert.deepEqual(planWrites.map((r) => r.statusCode).sort(), [201,409]);
  const fresh = await chart();
  assert.equal(fresh.plan?.number, oldPlan.number + 1);
  assert.equal(fresh.treatments.length, 0);
  assert.equal(fresh.plans?.length, 2);
  assert.ok((fresh.historyTreatments?.length ?? 0) >= oldCount, "History includes treatments from earlier plans");
  assert.equal(fresh.planDiscount, null);
  assert.equal(fresh.toothEvents.length, data.toothEvents.length);
  assert.equal(await db.treatment.count({ where: { patientId, planId: oldPlan.id } }), oldCount);
  assert.equal((await app.inject({ url: url + "/treatments", method: "POST", headers, payload: { ...input, planId: oldPlan.id } })).statusCode, 409);
  assert.equal((await app.inject({ url: url + "/plan-discount", method: "PUT", headers, payload: { discount: { type: "amount", value: "20" }, expectedId: null, planId: oldPlan.id } })).statusCode, 409);
  assert.equal((await write("/treatments", input)).statusCode, 201);
  assert.equal((await chart()).treatments.length, 1);
  assert.equal(await db.treatment.count({ where: { patientId, planId: fresh.plan!.id } }), 1);
  const unplannedProcedure = await db.procedure.create({ data: {
    roomId, code: "WALKIN", name: "Unplanned treatment", category: "other",
    defaultPrice: "35.00", dentition: "both", scope: "single_tooth",
    requiresLab: true, labLaboratory: "Walk-in Lab", labDefaultCost: "15.00",
    labTurnaroundDays: 2, labMaterial: "Composite", labShade: "A2",
  } });
  const walkInLab = await db.laboratory.create({ data: { roomId, name: "Walk-in Lab", defaultCost: "15.00", turnaroundDays: 2, material: "Composite", shade: "A2" } });
  await db.laboratoryProcedureRate.create({ data: { laboratoryId: walkInLab.id, procedureId: unplannedProcedure.id, cost: "15.00", currency: "USD", turnaroundDays: 2 } });
  const completedUnplanned = await app.inject({
    url: url + "/completed-treatments", method: "POST", headers,
    payload: { ...input, procedureId: unplannedProcedure.id, laboratoryId: walkInLab.id, planId: null, price: "1.00" },
  });
  assert.equal(completedUnplanned.statusCode, 201, completedUnplanned.body);
  const unplannedRecord = (await chart()).historyTreatments?.find((record) => record.procedureId === unplannedProcedure.id);
  assert.equal(unplannedRecord?.planId, null);
  assert.equal(unplannedRecord?.status, "completed");
  assert.equal(unplannedRecord?.price, "35.00", "Unplanned treatment uses the catalog price snapshot");
  assert.deepEqual(unplannedRecord?.events.map((event) => event.status), ["completed"]);
  const unplannedLabRequest = await db.labRequest.findUnique({ where: { treatmentId: unplannedRecord!.id } });
  assert.equal(unplannedLabRequest?.status, "to_request", "Unplanned laboratory work appears in Laboratory");
  assert.equal(unplannedLabRequest?.laboratory, "Walk-in Lab");
  assert.equal((await app.inject({
    url: `${url}/treatments/${unplannedRecord!.id}`, method: "PUT", headers,
    payload: { discount: { type: "amount", value: "5.00" }, date: unplannedRecord!.date, notes: "Net price adjustment", expectedVersion: unplannedRecord!.version },
  })).statusCode, 204, "Completed unplanned treatment pricing can be adjusted with an audit event");
  const adjustedUnplanned = (await chart()).historyTreatments!.find((record) => record.id === unplannedRecord!.id)!;
  assert.deepEqual(adjustedUnplanned.discount, { type: "amount", value: "5.00" });
  assert.equal(adjustedUnplanned.status, "completed");
  assert.equal((await app.inject({
    url: `${url}/treatments/${unplannedRecord!.id}`, method: "PUT", headers,
    payload: { discount: { type: "amount", value: "0.00" }, date: adjustedUnplanned.date, notes: "", expectedVersion: adjustedUnplanned.version },
  })).statusCode, 204);
  const savedUnplannedTotal = await app.inject({ method: "PUT", url: url + "/unplanned-discount", headers,
    payload: { discount: { type: "amount", value: "5.00" }, expectedId: null, planId: null } });
  assert.equal(savedUnplannedTotal.statusCode, 204, savedUnplannedTotal.body);
  const unplannedTotal = (await chart()).unplannedDiscount!;
  assert.deepEqual(unplannedTotal.discount, { type: "amount", value: "5.00" });
  assert.equal((await app.inject({ method: "PUT", url: url + "/unplanned-discount", headers,
    payload: { discount: { type: "amount", value: "0.00" }, expectedId: unplannedTotal.id, planId: null } })).statusCode, 204);
  assert.equal((await app.inject({
    url: url + "/completed-treatments", method: "POST", headers,
    payload: { ...input, procedureId: unplannedProcedure.id, laboratoryId: walkInLab.id, planId: fresh.plan!.id },
  })).statusCode, 400);
  const beforeDeleteIds = new Set((await chart()).historyTreatments!.map((record) => record.id));
  assert.equal((await app.inject({ url: url + "/completed-treatments", method: "POST", headers,
    payload: { ...input, procedureId: unplannedProcedure.id, laboratoryId: walkInLab.id, planId: null } })).statusCode, 201);
  const deletionCandidate = (await chart()).historyTreatments!.find((record) => !beforeDeleteIds.has(record.id))!;
  const deletionLab = await db.labRequest.findUniqueOrThrow({ where: { treatmentId: deletionCandidate.id } });
  assert.equal((await app.inject({ url: `${url}/treatments/${deletionCandidate.id}`, method: "DELETE", headers, payload: {} })).statusCode, 204);
  assert.equal(await db.treatment.count({ where: { id: deletionCandidate.id } }), 0);
  assert.equal(await db.treatmentEvent.count({ where: { treatmentId: deletionCandidate.id } }), 0);
  assert.equal(await db.treatmentTooth.count({ where: { treatmentId: deletionCandidate.id } }), 0);
  assert.equal(await db.labRequest.count({ where: { id: deletionLab.id } }), 0);
  assert.equal(await db.labRequestEvent.count({ where: { requestId: deletionLab.id } }), 0);
  assert.equal((await chart()).historyTreatments!.some((record) => record.id === deletionCandidate.id), false);
  const laboratoryAfterDelete = (await app.inject({ url: `/api/laboratory/${patientId}`, headers })).json();
  assert.equal(laboratoryAfterDelete.requests.some((request: { treatmentId: string }) => request.treatmentId === deletionCandidate.id), false);
  const paymentsAfterDelete = (await app.inject({ url: `/api/payments/${patientId}`, headers })).json();
  assert.equal(paymentsAfterDelete.ledger.some((entry: { id: string }) => entry.id === deletionCandidate.id), false);
  const walkIn = await db.patient.create({ data: { roomId, firstName: "WalkIn", lastName: "Patient", fullName: "WalkIn Patient", phone: "+961 3 123456", gender: "Female", firstVisit: new Date("2026-01-01") } });
  const walkUrl = `/api/odontogram/${walkIn.id}`;
  assert.equal((await app.inject({ url: walkUrl + "/sessions", method: "POST", headers: staffHeaders, payload: input })).statusCode, 403);
  assert.equal((await app.inject({ url: walkUrl + "/sessions", method: "POST", headers: { ...headers, "x-clinic-room": String(otherRoom) }, payload: input })).statusCode, 404);
  assert.equal((await app.inject({ url: walkUrl + "/sessions", method: "POST", headers, payload: { ...input, procedureId: foreignProcedure.id } })).statusCode, 404);
  assert.equal((await app.inject({ url: walkUrl + "/sessions", method: "POST", headers, payload: { ...input, price: "1.00" } })).statusCode, 201);
  const walkChart = (await app.inject({ url: walkUrl, headers })).json<ChartData>();
  assert.equal(walkChart.plan, null);
  assert.equal(walkChart.treatments.length, 0);
  assert.equal(walkChart.sessions?.length, 1);
  const session = walkChart.sessions![0];
  assert.equal(session.planId, null);
  assert.equal(session.price, "100.00");
  assert.equal(session.status, "in_progress");
  assert.equal(await db.treatmentPlan.count({ where: { patientId: walkIn.id } }), 0);
  assert.equal((await app.inject({ url: walkUrl + `/treatments/${session.id}/status`, method: "POST", headers, payload: { status: "completed", date: "2026-06-01", notes: "Done", expectedVersion: session.version } })).statusCode, 204);
  await db.screenPermission.delete({ where: { userId_screen: { userId: staff.id, screen: "treatment" } } });
  console.log("Odontogram API checks passed: repeated instances, independent/group pricing, FDI/surfaces, immutable completed history, corrections, concurrent state changes and scope isolation.");
}
