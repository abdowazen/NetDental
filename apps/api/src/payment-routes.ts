import type { FastifyInstance, FastifyRequest } from "fastify";
import { patientIdSchema, paymentInputSchema, type Action } from "@clinic/shared";
import { z } from "zod";
import type { PaymentStore } from "./payments.js";

export function registerPayments(app: FastifyInstance, store: PaymentStore,
  scope: (req: FastifyRequest, action: Action) => Promise<{ roomId: number; actorId: string }>) {
  app.get("/api/payments/:patientId", async (req) => {
    const { roomId } = await scope(req, "view");
    return store.getPayments(patientIdSchema.parse((req.params as { patientId: string }).patientId), roomId);
  });
  app.post("/api/payments/:patientId", { bodyLimit: 32768 }, async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create");
    await store.addPayment(patientIdSchema.parse((req.params as { patientId: string }).patientId), roomId, actorId, paymentInputSchema.parse(req.body));
    return reply.status(201).send({ ok: true });
  });
  const params = z.object({ patientId: patientIdSchema, id: z.string().uuid() });
  app.put("/api/payments/:patientId/:id", { bodyLimit: 32768 }, async (req, reply) => {
    const { roomId } = await scope(req, "modify");
    const value = params.parse(req.params);
    await store.updatePayment(value.patientId, roomId, value.id, paymentInputSchema.parse(req.body));
    return reply.status(204).send();
  });
  app.delete("/api/payments/:patientId/:id", async (req, reply) => {
    const { roomId } = await scope(req, "delete");
    const value = params.parse(req.params);
    await store.deletePayment(value.patientId, roomId, value.id);
    return reply.status(204).send();
  });
}
