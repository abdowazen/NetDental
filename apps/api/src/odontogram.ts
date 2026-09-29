import { Prisma, type PrismaClient } from "@prisma/client";
import type { ChartData, TreatmentInput, TreatmentStatusInput, FindingInput, ToothEventInput, VoidInput, Dentition, Treatment, Finding, ToothEvent } from "@clinic/shared";
import { clinicDate, toothInfo, findingSchema, toothEventSchema, discountSchema, moneyCents, moneyString, selectExchangeRate, treatmentNet, type Currency } from "@clinic/shared";
import { AccessError } from "./access.js";
import type { TreatmentEditInput, PlanTotalInput } from "@clinic/shared";

type Tx = Prisma.TransactionClient;
const date = (value: string) => new Date(value + "T00:00:00Z");
const day = (value: Date) => value.toISOString().slice(0, 10);
export interface OdontogramStore {
  createPlan(patientId: number, roomId: number, actorId: string, expectedPlanId: string | null): Promise<void>;
  editTreatment(patientId: number, roomId: number, actorId: string, id: string, input: TreatmentEditInput): Promise<void>;
  savePlanTotal(patientId: number, roomId: number, actorId: string, input: PlanTotalInput): Promise<void>;
  getChart(patientId: number, roomId: number): Promise<ChartData>;
  saveDentition(patientId: number, roomId: number, dentition: Dentition): Promise<void>;
  addClinicalRecord(patientId: number, roomId: number, actorId: string, kind: "tooth" | "finding", input: ToothEventInput | FindingInput): Promise<void>;
  voidClinicalRecord(patientId: number, roomId: number, actorId: string, id: string, input: VoidInput): Promise<void>;
  addTreatment(patientId: number, roomId: number, actorId: string, input: TreatmentInput, standalone?: boolean): Promise<void>;
  changeTreatment(patientId: number, roomId: number, actorId: string, id: string, input: TreatmentStatusInput): Promise<void>;
  voidTreatment(patientId: number, roomId: number, actorId: string, id: string, input: VoidInput): Promise<void>;
}
export function odontogramStore(db: PrismaClient): OdontogramStore {
  async function patient(tx: Tx, patientId: number, roomId: number) {
    if (!(await tx.patient.findFirst({ where: { id: patientId, roomId }, select: { id: true } })))
      throw new AccessError("NOT_FOUND");
  }
  async function scoped<T>(patientId: number, roomId: number, work: (tx: Tx) => Promise<T>) {
    return db.$transaction(async (tx) => {
      await patient(tx, patientId, roomId);
      return work(tx);
    });
  }
  async function currentPlan(tx: Tx, patientId: number) {
    return tx.treatmentPlan.findFirst({ where: { patientId }, orderBy: { number: "desc" } });
  }
  async function planForWrite(tx: Tx, patientId: number, actorId: string, expected: string | null) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`);
    const plan = await currentPlan(tx, patientId);
    if ((plan?.id ?? null) !== expected) throw new AccessError("CONFLICT");
    return plan ?? tx.treatmentPlan.create({ data: { patientId, number: 1, actorId } });
  }
  async function locked(tx: Tx, patientId: number, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
    // Serialize state changes to preserve the event sequence during concurrent edits.
    await tx.$queryRaw`SELECT "id" FROM "Treatment" WHERE "id" = ${id}::uuid AND "patientId" = ${patientId} FOR UPDATE`;
    const record = await tx.treatment.findFirst({ where: { id, patientId } });
    if (!record) throw new AccessError("NOT_FOUND");
    if (record.planId && record.planId !== (await currentPlan(tx, patientId))?.id) throw new AccessError("CONFLICT");
    return record;
  }
  return {
    createPlan: (patientId, roomId, actorId, expectedPlanId) => scoped(patientId, roomId, async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`);
      const previous = await currentPlan(tx, patientId);
      if ((previous?.id ?? null) !== expectedPlanId) throw new AccessError("CONFLICT");
      await tx.treatmentPlan.create({ data: { patientId, number: (previous?.number ?? 0) + 1, actorId } });
    }),
    getChart: (patientId, roomId) => scoped(patientId, roomId, async (tx) => {
      const plan = await currentPlan(tx, patientId);
      const today = clinicDate();
      const [config, clinical, treatments, plans, currencySettings, exchangeRates] = await Promise.all([
        tx.patientChart.findUnique({ where: { patientId } }),
        tx.clinicalRecord.findMany({ where: { patientId }, orderBy: [{ date: "desc" }, { recordedAt: "desc" }] }),
        tx.treatment.findMany({ where: { patientId }, include: { procedure: { select: { category: true } }, teeth: true, events: { orderBy: { recordedAt: "asc" } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
        tx.treatmentPlan.findMany({ where: { patientId }, orderBy: { number: "desc" } }),
        tx.currencySettings.findUnique({ where: { id: roomId } }),
        tx.exchangeRate.findMany({ where: { roomId, date: { gte: date(`${today.slice(0, 4)}-01-01`), lte: date(today) } }, orderBy: { date: "desc" } }),
      ]);
      const baseCurrency = (currencySettings?.baseCurrency ?? "USD") as Currency;
      const effectiveRate = selectExchangeRate(exchangeRates.map((row) => ({ date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() })), today);
      const audit = (row: typeof clinical[number]) => ({ id: row.id, date: day(row.date), actorId: row.actorId,
        recordedAt: row.recordedAt.toISOString(), voidReason: row.voidReason, voidDate: row.voidDate ? day(row.voidDate) : null, voidActorId: row.voidActorId });
      const mapped = treatments.map((row) => {
          const snapshot = row.snapshot as { code: string; name: string; scope: string; category?: string };
          return { id: row.id, planId: row.planId, procedureId: row.procedureId, ...snapshot, category: snapshot.category ?? row.procedure.category, price: row.price.toFixed(2), discount: { type: row.discountType, value: row.discountValue.toFixed(2) }, currency: "USD",
            date: day(row.date), notes: row.notes, status: row.status, version: row.version, voidReason: row.voidReason, replacesId: row.replacesId,
            teeth: row.teeth.map(({ tooth, surfaces, role }) => ({ tooth, surfaces, role })),
            events: row.events.map((event) => ({ ...event, date: day(event.date), recordedAt: event.recordedAt.toISOString() })),
          } as Treatment;
        });
      return {
        baseCurrency,
        effectiveRate,
        plan: plan ? { id: plan.id, number: plan.number, createdAt: plan.createdAt.toISOString() } : null,
        planDiscount: (() => { const row = clinical.filter((r) => r.kind === "plan_total" && r.planId === plan?.id).sort((a,b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
          return row ? { id: row.id, discount: discountSchema.parse((row.data as { discount: unknown }).discount) } : null; })(),
        dentition: (config?.dentition as Dentition) ?? null,
        toothEvents: clinical.filter((r) => r.kind === "tooth").map((r) => ({ ...toothEventSchema.parse(r.data), ...audit(r) })) as ToothEvent[],
        findings: clinical.filter((r) => r.kind === "finding").map((r) => ({ ...findingSchema.parse(r.data), ...audit(r) })) as Finding[],
        treatments: mapped.filter((row) => row.planId === plan?.id),
        sessions: mapped.filter((row) => row.planId === plan?.id || row.planId === null),
        historyTreatments: mapped,
        plans: plans.map((row) => ({ id: row.id, number: row.number, createdAt: row.createdAt.toISOString() })),

      };
    }),
    editTreatment: (patientId, roomId, actorId, id, input) => scoped(patientId, roomId, async (tx) => {
      const old = await locked(tx, patientId, id);
      if (old.voidReason || old.status !== "planned" || old.version !== input.expectedVersion) throw new AccessError("CONFLICT");
      if (input.discount.type === "amount" && moneyCents(input.discount.value) > moneyCents(old.price.toFixed(2))) throw new AccessError("VALIDATION_ERROR");
      await tx.treatment.update({ where: { id }, data: { discountType: input.discount.type, discountValue: input.discount.value, date: date(input.date), notes: input.notes,
        version: { increment: 1 }, events: { create: { status: "edited", date: date(input.date), actorId,
          notes: JSON.stringify({ before: { price: old.price.toFixed(2), discount: { type: old.discountType, value: old.discountValue.toFixed(2) }, date: day(old.date), notes: old.notes }, after: { price: old.price.toFixed(2), discount: input.discount, date: input.date, notes: input.notes } }) } } } });
    }),
    savePlanTotal: (patientId, roomId, actorId, input) => scoped(patientId, roomId, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${patientId} FOR UPDATE`;
      const plan = await planForWrite(tx, patientId, actorId, input.planId);
      const previous = await tx.clinicalRecord.findFirst({ where: { patientId, planId: plan.id, kind: "plan_total" }, orderBy: { recordedAt: "desc" } });
      if ((previous?.id ?? null) !== input.expectedId) throw new AccessError("CONFLICT");
      const rows = await tx.treatment.findMany({ where: { planId: plan.id, voidReason: null, status: { not: "cancelled" } } });
      const subtotal = rows.reduce((sum, r) => sum + treatmentNet({ price: r.price.toFixed(2),
        discount: discountSchema.parse({ type: r.discountType, value: r.discountValue.toFixed(2) }) }), 0n);
      if (input.discount.type === "amount" && moneyCents(input.discount.value) > subtotal) throw new AccessError("VALIDATION_ERROR");
      await tx.clinicalRecord.create({ data: { patientId, planId: plan.id, actorId, kind: "plan_total", date: new Date(),
        recordedAt: new Date(Math.max(Date.now(), (previous?.recordedAt.getTime() ?? 0) + 1)),
        data: { discount: input.discount, subtotalAtSave: moneyString(subtotal), previousId: previous?.id ?? null } } });
    }),
    saveDentition: (patientId, roomId, dentition) => scoped(patientId, roomId, async (tx) => {
      await tx.patientChart.upsert({ where: { patientId }, create: { patientId, dentition }, update: { dentition } });
    }),
    addClinicalRecord: (patientId, roomId, actorId, kind, input) => scoped(patientId, roomId, async (tx) => {
      await tx.clinicalRecord.create({ data: { patientId, actorId, kind, date: date(input.date), data: input } });
    }),
    voidClinicalRecord: (patientId, roomId, actorId, id, input) => scoped(patientId, roomId, async (tx) => {
      const count = await tx.clinicalRecord.updateMany({ where: { id, patientId, voidReason: null },
        data: { voidReason: input.reason, voidDate: date(input.date), voidActorId: actorId } });
      if (!count.count) throw new AccessError("CONFLICT");
    }),
    addTreatment: (patientId, roomId, actorId, input, standalone = false) => scoped(patientId, roomId, async (tx) => {
      const plan = standalone ? null : await planForWrite(tx, patientId, actorId, input.planId);
      const procedure = await tx.procedure.findFirst({ where: { id: input.procedureId, roomId, active: true } });
      if (!procedure) throw new AccessError("NOT_FOUND");
      const { teeth, mode } = input;
      if (teeth.some((t) => procedure.dentition !== "both" && (toothInfo(t.tooth).primary ? "primary" : "permanent") !== procedure.dentition))
        throw new AccessError("VALIDATION_ERROR");
      if (procedure.scope === "whole_mouth" ? teeth.length > 0 || mode !== "group" : !teeth.length)
        throw new AccessError("VALIDATION_ERROR");
      if (["single_tooth", "tooth_surfaces"].includes(procedure.scope) && mode === "group" && teeth.length !== 1)
        throw new AccessError("VALIDATION_ERROR");
      if (procedure.scope === "multiple_teeth" && (mode !== "group" || teeth.length < 2))
        throw new AccessError("VALIDATION_ERROR");
      if (procedure.scope === "tooth_surfaces" && teeth.some((t) => !t.surfaces.length))
        throw new AccessError("VALIDATION_ERROR");
      if (input.replacesId) {
        const old = await locked(tx, patientId, input.replacesId);
        if (!old.voidReason || old.planId !== (plan?.id ?? null)) throw new AccessError("CONFLICT");
      }
      const groups = mode === "independent" ? teeth.map((tooth) => [tooth]) : [teeth];
      for (const group of groups) {
        const treatment = await tx.treatment.create({ data: {
          patientId, planId: plan?.id ?? null, status: standalone ? "in_progress" : "planned", procedureId: procedure.id,
          snapshot: { code: procedure.code, name: procedure.name, category: procedure.category, scope: procedure.scope, dentition: procedure.dentition,
            requiresLab: procedure.requiresLab, labLaboratory: procedure.labLaboratory, labDefaultCost: procedure.labDefaultCost.toFixed(2), labTurnaroundDays: procedure.labTurnaroundDays,
            labMaterial: procedure.labMaterial, labShade: procedure.labShade, labInstructions: procedure.labInstructions,
            chartIndicator: procedure.chartIndicator, defaultPrice: procedure.defaultPrice.toFixed(2), mode },
          price: standalone ? procedure.defaultPrice : input.price, date: date(input.date), notes: input.notes, replacesId: input.replacesId,
          teeth: { create: group },
          events: { create: { status: standalone ? "in_progress" : "planned", date: date(input.date), notes: input.notes, actorId } },
        } });
        if (procedure.requiresLab) {
          const requestDate = date(input.date);
          const dueDate = new Date(requestDate);
          dueDate.setUTCDate(dueDate.getUTCDate() + procedure.labTurnaroundDays);
          await tx.labRequest.create({ data: {
            treatmentId: treatment.id, patientId, roomId, createdById: actorId,
            laboratory: procedure.labLaboratory, cost: procedure.labDefaultCost,
            material: procedure.labMaterial, shade: procedure.labShade,
            instructions: procedure.labInstructions, requestDate, dueDate,
            events: { create: { action: "to_request", date: requestDate, actorId } },
          } });
        }
      }
    }),
    changeTreatment: (patientId, roomId, actorId, id, input) => scoped(patientId, roomId, async (tx) => {
      const old = await locked(tx, patientId, id);
      const valid: Record<string, string[]> = { planned: ["in_progress", "completed", "cancelled"], in_progress: ["completed", "cancelled"], completed: [], cancelled: [] };
      const last = await tx.treatmentEvent.findFirst({ where: { treatmentId: id }, orderBy: { recordedAt: "desc" } });
      if (old.voidReason || old.version !== input.expectedVersion || !valid[old.status]?.includes(input.status) ||
          input.date < day(last?.date ?? old.date) || (input.status === "cancelled" && !input.notes.trim()))
        throw new AccessError("CONFLICT");
      await tx.treatment.update({ where: { id }, data: { status: input.status, version: { increment: 1 },
        events: { create: { status: input.status, date: date(input.date), notes: input.notes, actorId } } } });
    }),
    voidTreatment: (patientId, roomId, actorId, id, input) => scoped(patientId, roomId, async (tx) => {
      const old = await locked(tx, patientId, id);
      if (old.voidReason) throw new AccessError("CONFLICT");
      await tx.treatment.update({ where: { id }, data: { voidReason: input.reason, version: { increment: 1 },
        events: { create: { status: "voided", date: date(input.date), notes: input.reason, actorId } } } });
      const lab = await tx.labRequest.findUnique({ where: { treatmentId: id } });
      if (lab && lab.status !== "voided") await tx.labRequest.update({ where: { id: lab.id }, data: { status: "voided",
        events: { create: { action: "voided", date: date(input.date), actorId } } } });
    }),
  };
}
