import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { patientIdSchema, chartConfigSchema, toothEventSchema, findingSchema, treatmentSchema, treatmentStatusSchema, voidSchema, type Action } from "@clinic/shared";
import type { OdontogramStore } from "./odontogram.js";
import { treatmentEditSchema, planTotalSchema } from "@clinic/shared";

export function registerOdontogram(app: FastifyInstance, store: OdontogramStore,
  scope: (req: FastifyRequest, action: Action) => Promise<{ roomId: number; actorId: string }>) {
  const params = z.object({ patientId: patientIdSchema, id: z.string().uuid().optional() });
  app.post("/api/odontogram/:patientId/sessions", { bodyLimit: 32768 }, async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create");
    const input = treatmentSchema.refine((value) => value.planId === null, "VALIDATION_ERROR").parse(req.body);
    await store.addTreatment(params.parse(req.params).patientId, roomId, actorId, input, "session");
    return reply.status(201).send({ ok: true });
  });
  app.post("/api/odontogram/:patientId/completed-treatments", { bodyLimit: 32768 }, async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create");
    const input = treatmentSchema.refine((value) => value.planId === null, "VALIDATION_ERROR").parse(req.body);
    await store.addTreatment(params.parse(req.params).patientId, roomId, actorId, input, "completed");
    return reply.status(201).send({ ok: true });
  });
  app.post("/api/odontogram/:patientId/plans", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create");
    const input = z.object({ expectedPlanId: z.string().uuid().nullable() }).strict().parse(req.body);
    await store.createPlan(params.parse(req.params).patientId, roomId, actorId, input.expectedPlanId);
    return reply.status(201).send({ ok: true });
  });
  app.put("/api/odontogram/:patientId/plan-discount", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify");
    await store.savePlanTotal(params.parse(req.params).patientId, roomId, actorId, planTotalSchema.parse(req.body));
    return reply.status(204).send();
  });
  app.put("/api/odontogram/:patientId/unplanned-discount", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify");
    await store.saveUnplannedTotal(params.parse(req.params).patientId, roomId, actorId, planTotalSchema.parse(req.body));
    return reply.status(204).send();
  });
  app.put("/api/odontogram/:patientId/treatments/:id", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify");
    const p = params.parse(req.params);
    await store.editTreatment(p.patientId, roomId, actorId, p.id!, treatmentEditSchema.parse(req.body));
    return reply.status(204).send();
  });
  app.delete("/api/odontogram/:patientId/treatments/:id", async (req, reply) => {
    const { roomId } = await scope(req, "delete");
    const p = params.parse(req.params);
    await store.deleteTreatment(p.patientId, roomId, p.id!);
    return reply.status(204).send();
  });
  app.get("/api/odontogram/:patientId", async (req) => {
    const { roomId } = await scope(req, "view");
    return store.getChart(params.parse(req.params).patientId, roomId);
  });
  app.put("/api/odontogram/:patientId/config", async (req, reply) => {
    const { roomId } = await scope(req, "modify");
    await store.saveDentition(params.parse(req.params).patientId, roomId, chartConfigSchema.parse(req.body).dentition);
    return reply.status(204).send();
  });
  for (const [path, kind] of [["tooth-events", "tooth"], ["findings", "finding"]] as const) {
    app.post(`/api/odontogram/:patientId/${path}`, { bodyLimit: 32768 }, async (req, reply) => {
      const { roomId, actorId } = await scope(req, "create");
      const input = kind === "tooth" ? toothEventSchema.parse(req.body) : findingSchema.parse(req.body);
      await store.addClinicalRecord(params.parse(req.params).patientId, roomId, actorId, kind, input);
      return reply.status(201).send({ ok: true });
    });
  }
  app.post("/api/odontogram/:patientId/clinical/:id/void", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify");
    const p = params.parse(req.params);
    await store.voidClinicalRecord(p.patientId, roomId, actorId, p.id!, voidSchema.parse(req.body));
    return reply.status(204).send();
  });
  app.post("/api/odontogram/:patientId/treatments", { bodyLimit: 32768 }, async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create");
    await store.addTreatment(params.parse(req.params).patientId, roomId, actorId, treatmentSchema.parse(req.body));
    return reply.status(201).send({ ok: true });
  });
  app.post("/api/odontogram/:patientId/treatments/:id/status", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify");
    const p = params.parse(req.params);
    await store.changeTreatment(p.patientId, roomId, actorId, p.id!, treatmentStatusSchema.parse(req.body));
    return reply.status(204).send();
  });
  app.post("/api/odontogram/:patientId/treatments/:id/void", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify");
    const p = params.parse(req.params);
    await store.voidTreatment(p.patientId, roomId, actorId, p.id!, voidSchema.parse(req.body));
    return reply.status(204).send();
  });
}
