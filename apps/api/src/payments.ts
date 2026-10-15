import { Prisma, type PrismaClient } from "@prisma/client";
import {
  clinicDate, convertCurrency, discountSchema, discountCents, moneyCents,
  moneyString, selectExchangeRate, treatmentNet,
  type Currency, type ExchangeRate, type PaymentInput, type PaymentSummary,
} from "@clinic/shared";
import { AccessError } from "./access.js";

const day = (value: Date) => value.toISOString().slice(0, 10);
const signedMoney = (cents: bigint) => {
  const negative = cents < 0n;
  const value = negative ? -cents : cents;
  return `${negative ? "-" : ""}${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
};
export interface PaymentStore {
  getPayments(patientId: number, roomId: number): Promise<PaymentSummary>;
  addPayment(patientId: number, roomId: number, actorId: string, input: PaymentInput): Promise<void>;
  updatePayment(patientId: number, roomId: number, id: string, input: PaymentInput): Promise<void>;
  deletePayment(patientId: number, roomId: number, id: string): Promise<void>;
}
export function paymentStore(db: PrismaClient): PaymentStore {
  async function patient(patientId: number, roomId: number) {
    if (!(await db.patient.findFirst({ where: { id: patientId, roomId }, select: { id: true } })))
      throw new AccessError("NOT_FOUND");
  }
  async function baseCurrency(roomId: number): Promise<Currency> {
    return (await db.currencySettings.findUnique({ where: { id: roomId } }))?.baseCurrency ?? "USD";
  }
  async function rate(roomId: number, date: string): Promise<ExchangeRate | null> {
    const rows = await db.exchangeRate.findMany({
      where: { roomId, date: { gte: new Date(`${date.slice(0, 4)}-01-01T00:00:00Z`), lte: new Date(`${date}T00:00:00Z`) } },
      orderBy: { date: "desc" },
    });
    return selectExchangeRate(rows.map((row) => ({ date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() })), date);
  }
  async function context(patientId: number, roomId: number) {
    await patient(patientId, roomId);
    const plan = await db.treatmentPlan.findFirst({ where: { patientId }, orderBy: { number: "desc" } });
    const [plannedTreatments, unplannedTreatments, totalRecord, unplannedTotalRecord, payments, base] = await Promise.all([
      plan ? db.treatment.findMany({ where: { patientId, planId: plan.id, voidReason: null, status: { not: "cancelled" } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }) : [],
      db.treatment.findMany({ where: { patientId, planId: null, voidReason: null, status: { not: "cancelled" } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
      plan ? db.clinicalRecord.findFirst({ where: { patientId, planId: plan.id, kind: "plan_total" }, orderBy: { recordedAt: "desc" } }) : null,
      db.clinicalRecord.findFirst({ where: { patientId, planId: null, kind: "unplan_total" }, orderBy: { recordedAt: "desc" } }),
      db.payment.findMany({
        where: { patientId, roomId, ...(plan ? { OR: [{ planId: plan.id }, { planId: null }] } : { planId: null }) },
        orderBy: [{ date: "desc" }, { recordedAt: "desc" }],
      }),
      baseCurrency(roomId),
    ]);
    return { plan, plannedTreatments, unplannedTreatments, treatments: [...plannedTreatments, ...unplannedTreatments], totalRecord, unplannedTotalRecord, payments, base };
  }
  return {
    async getPayments(patientId, roomId) {
      const { plannedTreatments, unplannedTreatments, treatments, totalRecord, unplannedTotalRecord, payments, base } = await context(patientId, roomId);
      const today = clinicDate();
      const effectiveRate = await rate(roomId, today);
      if (base === "LBP" && !effectiveRate) throw new AccessError("VALIDATION_ERROR");
      const grossUsd = treatments.reduce((sum, row) => sum + moneyCents(row.price.toFixed(2)), 0n);
      const afterRowsUsd = treatments.reduce((sum, row) => sum + treatmentNet({
        price: row.price.toFixed(2), discount: discountSchema.parse({ type: row.discountType, value: row.discountValue.toFixed(2) }),
      }), 0n);
      const plannedAfterRowsUsd = plannedTreatments.reduce((sum, row) => sum + treatmentNet({
        price: row.price.toFixed(2), discount: discountSchema.parse({ type: row.discountType, value: row.discountValue.toFixed(2) }),
      }), 0n);
      const unplannedAfterRowsUsd = unplannedTreatments.reduce((sum, row) => sum + treatmentNet({
        price: row.price.toFixed(2), discount: discountSchema.parse({ type: row.discountType, value: row.discountValue.toFixed(2) }),
      }), 0n);
      const planDiscount = totalRecord
        ? discountSchema.parse((totalRecord.data as { discount: unknown }).discount)
        : { type: "amount" as const, value: "0.00" };
      const unplannedDiscount = unplannedTotalRecord
        ? discountSchema.parse((unplannedTotalRecord.data as { discount: unknown }).discount)
        : { type: "amount" as const, value: "0.00" };
      const netUsd = afterRowsUsd - discountCents(plannedAfterRowsUsd, planDiscount) - discountCents(unplannedAfterRowsUsd, unplannedDiscount);
      const grossBase = moneyCents(convertCurrency(moneyString(grossUsd), "USD", base, effectiveRate));
      const netBase = moneyCents(convertCurrency(moneyString(netUsd), "USD", base, effectiveRate));
      const discountBase = grossBase - netBase;
      const paymentRows = await Promise.all(payments.map(async (row) => {
        const originalCurrency = row.currency as Currency;
        const storedBaseCurrency = row.baseCurrency as Currency;
        let converted = row.baseAmount.toFixed(2);
        if (storedBaseCurrency !== base) {
          const snapshot = row.lbpPerUsd
            ? { date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() }
            : originalCurrency === base ? null : (await rate(roomId, day(row.date))) ?? effectiveRate;
          try { converted = convertCurrency(row.amount.toFixed(2), originalCurrency, base, snapshot); }
          catch { throw new AccessError("VALIDATION_ERROR"); }
        }
        return {
          id: row.id, amount: row.amount.toFixed(2), currency: originalCurrency,
          baseCurrency: base, baseAmount: converted,
          lbpPerUsd: row.lbpPerUsd?.toFixed() ?? null, method: row.method as PaymentInput["method"],
          date: day(row.date), note: row.note, actorId: row.actorId, recordedAt: row.recordedAt.toISOString(),
        };
      }));
      const receivedBase = paymentRows.reduce((sum, row) => sum + moneyCents(row.baseAmount), 0n);
      return {
        baseCurrency: base, effectiveRate,
        planEstimate: moneyString(grossBase), discountAmount: moneyString(discountBase),
        discountPercent: grossBase ? moneyString((discountBase * 10000n + grossBase / 2n) / grossBase) : "0.00",
        patientCharge: moneyString(netBase), paymentReceived: moneyString(receivedBase),
        patientBalance: signedMoney(netBase - receivedBase), payments: paymentRows,
        ledger: [
          ...treatments.map((row) => {
            const net = treatmentNet({ price: row.price.toFixed(2), discount: discountSchema.parse({ type: row.discountType, value: row.discountValue.toFixed(2) }) });
            return { id: row.id, type: "charge" as const, date: day(row.date),
              description: (row.snapshot as { name?: string }).name ?? "Procedure",
              originalAmount: moneyString(net), originalCurrency: "USD" as const,
              baseAmount: convertCurrency(moneyString(net), "USD", base, effectiveRate), baseCurrency: base };
          }),
          ...paymentRows.map((row) => ({ id: row.id, type: "payment" as const, date: row.date,
            description: row.note, originalAmount: row.amount, originalCurrency: row.currency,
            baseAmount: row.baseAmount, baseCurrency: row.baseCurrency, method: row.method })),
        ].sort((a, b) => b.date.localeCompare(a.date)),
      } satisfies PaymentSummary;
    },
    async addPayment(patientId, roomId, actorId, input) {
      if (input.date > clinicDate()) throw new AccessError("VALIDATION_ERROR");
      const { plan, base } = await context(patientId, roomId);
      const effectiveRate = await rate(roomId, input.date);
      if (input.currency !== base && !effectiveRate) throw new AccessError("VALIDATION_ERROR");
      const baseAmount = convertCurrency(input.amount, input.currency, base, effectiveRate);
      await db.payment.create({ data: {
        patientId, roomId, planId: plan?.id ?? null, actorId, amount: new Prisma.Decimal(input.amount),
        currency: input.currency, baseCurrency: base, baseAmount: new Prisma.Decimal(baseAmount),
        lbpPerUsd: effectiveRate ? new Prisma.Decimal(effectiveRate.lbpPerUsd) : null,
        method: input.method, date: new Date(`${input.date}T00:00:00Z`), note: input.note,
      } });
    },
    async updatePayment(patientId, roomId, id, input) {
      if (input.date > clinicDate()) throw new AccessError("VALIDATION_ERROR");
      await patient(patientId, roomId);
      const existing = await db.payment.findFirst({ where: { id, patientId, roomId } });
      if (!existing) throw new AccessError("NOT_FOUND");
      const base = await baseCurrency(roomId);
      const effectiveRate = await rate(roomId, input.date);
      if (input.currency !== base && !effectiveRate) throw new AccessError("VALIDATION_ERROR");
      const baseAmount = convertCurrency(input.amount, input.currency, base, effectiveRate);
      await db.payment.update({ where: { id }, data: {
        amount: new Prisma.Decimal(input.amount), currency: input.currency, baseCurrency: base,
        baseAmount: new Prisma.Decimal(baseAmount), lbpPerUsd: effectiveRate ? new Prisma.Decimal(effectiveRate.lbpPerUsd) : null,
        method: input.method, date: new Date(`${input.date}T00:00:00Z`), note: input.note,
      } });
    },
    async deletePayment(patientId, roomId, id) {
      await patient(patientId, roomId);
      const existing = await db.payment.findFirst({ where: { id, patientId, roomId }, select: { id: true } });
      if (!existing) throw new AccessError("NOT_FOUND");
      await db.payment.delete({ where: { id } });
    },
  };
}
