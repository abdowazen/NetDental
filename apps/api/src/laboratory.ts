import { Prisma, type PrismaClient } from "@prisma/client";
import { moneyCents, moneyString, type LabDetailsInput, type LabRequest, type LabSummary } from "@clinic/shared";
import { AccessError } from "./access.js";

const date = (value: string) => new Date(`${value}T00:00:00Z`);
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;
export interface LaboratoryStore {
  getLabRequests(patientId: number, roomId: number): Promise<LabSummary>;
  createLabDraft(patientId: number, roomId: number, actorId: string, treatmentId: string, actionDate: string): Promise<void>;
  updateLabRequest(patientId: number, roomId: number, actorId: string, id: string, input: LabDetailsInput): Promise<void>;
  transitionLabRequest(patientId: number, roomId: number, actorId: string, id: string, action: "requested" | "received", actionDate: string): Promise<void>;
}
export function laboratoryStore(db: PrismaClient): LaboratoryStore {
  const include = { treatment: { include: { procedure: true, plan: true, teeth: true } }, events: { orderBy: { recordedAt: "asc" as const } } };
  const map = (row: Prisma.LabRequestGetPayload<{ include: typeof include }>): LabRequest => {
    const snapshot = row.treatment.snapshot as { code: string; name: string };
    return { id: row.id, treatmentId: row.treatmentId, patientId: row.patientId, planId: row.treatment.planId,
      planNumber: row.treatment.plan?.number ?? null, procedureCode: snapshot.code, procedureName: snapshot.name,
      teeth: row.treatment.teeth.map((item) => item.tooth), status: row.status as LabRequest["status"],
      laboratory: row.laboratory, cost: row.cost.toFixed(2), material: row.material, shade: row.shade,
      instructions: row.instructions, requestDate: day(row.requestDate) ?? day(row.createdAt)!,
      dueDate: day(row.dueDate) ?? day(row.createdAt)!, receivedDate: day(row.receivedDate), createdAt: row.createdAt.toISOString(),
      events: row.events.map((event) => ({ id: event.id, action: event.action, date: day(event.date)!, actorId: event.actorId, recordedAt: event.recordedAt.toISOString() })) };
  };
  async function scoped(patientId: number, roomId: number, id: string) {
    const row = await db.labRequest.findFirst({ where: { id, patientId, roomId }, include });
    if (!row) throw new AccessError("NOT_FOUND");
    return row;
  }
  return {
    async getLabRequests(patientId, roomId) {
      if (!(await db.patient.findFirst({ where: { id: patientId, roomId }, select: { id: true } }))) throw new AccessError("NOT_FOUND");
      const rows = await db.labRequest.findMany({ where: { patientId, roomId }, include, orderBy: [{ updatedAt: "desc" }, { id: "desc" }] });
      return { requests: rows.map(map), totalCost: moneyString(rows.filter((row) => !["to_request", "voided"].includes(row.status)).reduce((sum, row) => sum + moneyCents(row.cost.toFixed(2)), 0n)) };
    },
    async createLabDraft(patientId, roomId, actorId, treatmentId, actionDate) {
      try {
        await db.$transaction(async (tx) => {
          const treatment = await tx.treatment.findFirst({ where: { id: treatmentId, patientId, patient: { roomId } }, include: { procedure: true } });
          if (!treatment || treatment.voidReason || treatment.status === "cancelled") throw new AccessError("NOT_FOUND");
          const snapshot = treatment.snapshot as { requiresLab?: boolean; labLaboratory?: string; labDefaultCost?: string; labTurnaroundDays?: number; labMaterial?: string; labShade?: string; labInstructions?: string };
          if (!snapshot.requiresLab) throw new AccessError("VALIDATION_ERROR");
          const requestDate = date(actionDate);
          const dueDate = new Date(requestDate); dueDate.setUTCDate(dueDate.getUTCDate() + (snapshot.labTurnaroundDays ?? treatment.procedure.labTurnaroundDays));
          await tx.labRequest.create({ data: { treatmentId, patientId, roomId, createdById: actorId,
            laboratory: snapshot.labLaboratory ?? treatment.procedure.labLaboratory,
            cost: snapshot.labDefaultCost ?? treatment.procedure.labDefaultCost, material: snapshot.labMaterial ?? treatment.procedure.labMaterial,
            shade: snapshot.labShade ?? treatment.procedure.labShade, instructions: snapshot.labInstructions ?? treatment.procedure.labInstructions, requestDate, dueDate,
            events: { create: { action: "to_request", date: requestDate, actorId } } } });
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new AccessError("CONFLICT");
        throw error;
      }
    },
    async updateLabRequest(patientId, roomId, actorId, id, input) {
      const row = await scoped(patientId, roomId, id);
      if (row.status !== "to_request") throw new AccessError("CONFLICT");
      await db.labRequest.update({ where: { id }, data: { laboratory: input.laboratory, cost: input.cost, material: input.material,
        shade: input.shade, instructions: input.instructions, requestDate: date(input.requestDate), dueDate: date(input.dueDate),
        events: { create: { action: "updated", date: date(input.requestDate), actorId } } } });
    },
    async transitionLabRequest(patientId, roomId, actorId, id, action, actionDate) {
      const row = await scoped(patientId, roomId, id);
      const expected = action === "requested" ? "to_request" : "requested";
      const lastDate = row.events.at(-1)?.date ?? row.createdAt;
      if (row.status !== expected || actionDate < day(lastDate)! || (action === "requested" && (!row.laboratory.trim() || !row.dueDate))) throw new AccessError("CONFLICT");
      await db.labRequest.update({ where: { id }, data: { status: action,
        ...(action === "requested" ? { requestDate: date(actionDate) } : { receivedDate: date(actionDate) }),
        events: { create: { action, date: date(actionDate), actorId } } } });
    },
  };
}
