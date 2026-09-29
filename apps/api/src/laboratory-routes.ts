import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { labDetailsSchema, labDraftSchema, labTransitionSchema, patientIdSchema, type Action } from "@clinic/shared";
import type { LaboratoryStore } from "./laboratory.js";

export function registerLaboratory(app: FastifyInstance, store: LaboratoryStore,
  scope: (req: FastifyRequest, action: Action) => Promise<{ roomId: number; actorId: string }>) {
  const params = z.object({ patientId: patientIdSchema, id: z.string().uuid().optional() });
  app.get("/api/laboratory/:patientId", async (req) => {
    const { roomId } = await scope(req, "view"); const p = params.parse(req.params);
    return store.getLabRequests(p.patientId, roomId);
  });
  app.post("/api/laboratory/:patientId/drafts", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create"); const p = params.parse(req.params); const input = labDraftSchema.parse(req.body);
    await store.createLabDraft(p.patientId, roomId, actorId, input.treatmentId, input.date); return reply.status(201).send({ ok: true });
  });
  app.put("/api/laboratory/:patientId/:id", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify"); const p = params.parse(req.params);
    await store.updateLabRequest(p.patientId, roomId, actorId, p.id!, labDetailsSchema.parse(req.body)); return reply.status(204).send();
  });
  app.post("/api/laboratory/:patientId/:id/status", async (req, reply) => {
    const { roomId, actorId } = await scope(req, "modify"); const p = params.parse(req.params); const input = labTransitionSchema.parse(req.body);
    await store.transitionLabRequest(p.patientId, roomId, actorId, p.id!, input.action, input.date); return reply.status(204).send();
  });
}
