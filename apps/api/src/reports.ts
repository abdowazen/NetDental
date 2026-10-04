import { Prisma, type PrismaClient } from "@prisma/client";
import {
  clinicDate, convertCurrency, discountCents, discountSchema, moneyCents, moneyString, selectExchangeRate, treatmentNet,
  type Currency, type LabStatementQuery, type LabStatementReport, type NewPatientReport, type NewPatientReportQuery,
  type Patient, type PatientStatementQuery, type PatientStatementReport, type PatientStatementRow,
} from "@clinic/shared";
import { AccessError } from "./access.js";

type PatientRow = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  gender: string;
  fatherName: string;
  job: string;
  age: number;
  firstVisit: Date;
  notes: string;
  createdAt: Date;
};

const dateText = (value: Date) => value.toISOString().slice(0, 10);
function addDays(value: string, days: number) {
  const result = new Date(`${value}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return dateText(result);
}
function bounds(period: NewPatientReportQuery["period"], selected: string) {
  const year = Number(selected.slice(0, 4));
  const month = Number(selected.slice(5, 7));
  if (period === "daily") return { start: selected, end: addDays(selected, 1) };
  if (period === "monthly") {
    const start = `${selected.slice(0, 7)}-01`;
    return { start, end: dateText(new Date(Date.UTC(year, month, 1))) };
  }
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}
function publicPatient(row: PatientRow): Patient & { registeredAt: string } {
  return {
    id: row.id,
    fileId: String(row.id).padStart(6, "0"),
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    phone: row.phone,
    gender: row.gender as Patient["gender"],
    fatherName: row.fatherName,
    job: row.job as Patient["job"],
    age: row.age,
    firstVisit: dateText(row.firstVisit),
    notes: row.notes,
    registeredAt: row.createdAt.toISOString(),
  };
}

export interface ReportStore {
  getNewPatientsReport(input: NewPatientReportQuery, roomId: number): Promise<NewPatientReport>;
  getLabStatement(input: LabStatementQuery, roomId: number): Promise<LabStatementReport>;
  getPatientStatement(input: PatientStatementQuery, roomId: number): Promise<PatientStatementReport>;
}

const signedMoney = (cents: bigint) => {
  const negative = cents < 0n; const value = negative ? -cents : cents;
  return `${negative ? "-" : ""}${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
};
const signedCents = (amount: string) => {
  const negative = amount.startsWith("-"); const [whole, fraction = ""] = amount.replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); return negative ? -value : value;
};

export function reportStore(db: PrismaClient): ReportStore {
  return {
    async getNewPatientsReport(input, roomId) {
      const { start, end } = bounds(input.period, input.date);
      const localCreated = Prisma.sql`("createdAt" AT TIME ZONE 'Asia/Beirut')`;
      const filter = Prisma.sql`"roomId" = ${roomId} AND ${localCreated} >= ${start}::timestamp AND ${localCreated} < ${end}::timestamp`;
      const columns = {
        id: Prisma.sql`"id"`,
        fullName: Prisma.sql`lower("fullName")`,
        phone: Prisma.sql`"phone"`,
        gender: Prisma.sql`"gender"`,
        firstVisit: Prisma.sql`"firstVisit"`,
        createdAt: Prisma.sql`"createdAt"`,
      };
      const order = input.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const bucketExpression = input.period === "daily"
        ? Prisma.sql`EXTRACT(HOUR FROM ${localCreated})::int`
        : input.period === "monthly"
          ? Prisma.sql`EXTRACT(DAY FROM ${localCreated})::int`
          : Prisma.sql`EXTRACT(MONTH FROM ${localCreated})::int`;
      const [counts, grouped, rows] = await db.$transaction([
        db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "Patient" WHERE ${filter}`),
        db.$queryRaw<{ bucket: number; count: bigint }[]>(Prisma.sql`SELECT ${bucketExpression} AS bucket, count(*) AS count FROM "Patient" WHERE ${filter} GROUP BY bucket ORDER BY bucket`),
        db.$queryRaw<PatientRow[]>(Prisma.sql`SELECT "id", "firstName", "lastName", "fullName", "phone", "gender", "fatherName", "job", "age", "firstVisit", "notes", "createdAt" FROM "Patient" WHERE ${filter} ORDER BY ${columns[input.sort]} ${order}, "id" ${order} LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`),
      ]);
      const countsByBucket = new Map(grouped.map((row) => [Number(row.bucket), Number(row.count)]));
      const bucketCount = input.period === "daily" ? 24 : input.period === "monthly" ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).getUTCDate() : 12;
      const buckets = Array.from({ length: bucketCount }, (_, index) => ({
        key: input.period === "daily" ? `${String(index).padStart(2, "0")}:00` : String(index + 1).padStart(2, "0"),
        count: countsByBucket.get(input.period === "daily" ? index : index + 1) ?? 0,
      }));
      return {
        period: input.period,
        selectedDate: input.date,
        from: start,
        to: addDays(end, -1),
        total: Number(counts[0]?.total ?? 0),
        buckets,
        patients: rows.map(publicPatient),
      };
    },
    async getLabStatement(input, roomId) {
      const requestDate = { gte: new Date(`${input.from}T00:00:00Z`), lte: new Date(`${input.to}T00:00:00Z`) };
      const where: Prisma.LabRequestWhereInput = {
        roomId, requestDate,
        ...(input.status === "all" ? {} : { status: input.status }),
        ...(input.laboratoryId ? { treatment: { laboratoryId: input.laboratoryId } } : {}),
      };
      const orderBy: Prisma.LabRequestOrderByWithRelationInput = input.sort === "patient" ? { patient: { fullName: input.direction } }
        : input.sort === "procedure" ? { treatment: { procedure: { name: input.direction } } }
          : { [input.sort]: input.direction };
      const payableStatuses = input.status === "all" ? ["requested", "received"] : ["requested", "received"].includes(input.status) ? [input.status] : [];
      const payableWhere = { ...where, status: { in: payableStatuses } } satisfies Prisma.LabRequestWhereInput;
      const [total, rows, usdTotal, lbpTotal] = await db.$transaction([
        db.labRequest.count({ where }),
        db.labRequest.findMany({ where, include: { patient: true, treatment: { include: { teeth: true } } }, orderBy: [orderBy, { id: input.direction }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
        db.labRequest.aggregate({ where: { ...payableWhere, currency: "USD" }, _sum: { cost: true } }),
        db.labRequest.aggregate({ where: { ...payableWhere, currency: "LBP" }, _sum: { cost: true } }),
      ]);
      return { total, rows: rows.map((row) => {
        const snapshot = row.treatment.snapshot as { code: string; name: string };
        return { id: row.id, laboratoryId: row.treatment.laboratoryId, laboratory: row.laboratory, patientId: row.patientId,
          patientFileId: String(row.patientId).padStart(6, "0"), patientName: row.patient.fullName,
          procedureCode: snapshot.code, procedureName: snapshot.name, teeth: row.treatment.teeth.map((tooth) => tooth.tooth),
          requestDate: dateText(row.requestDate ?? row.createdAt), dueDate: row.dueDate ? dateText(row.dueDate) : null,
          receivedDate: row.receivedDate ? dateText(row.receivedDate) : null, status: row.status as "to_request" | "requested" | "received" | "voided",
          cost: row.cost.toFixed(2), currency: row.currency as "USD" | "LBP",
        };
      }), payableTotals: [
        { currency: "USD", amount: (usdTotal._sum.cost ?? new Prisma.Decimal(0)).toFixed(2) },
        { currency: "LBP", amount: (lbpTotal._sum.cost ?? new Prisma.Decimal(0)).toFixed(2) },
      ] };
    },
    async getPatientStatement(input, roomId) {
      const patientWhere = { roomId, ...(input.patientId ? { id: input.patientId } : {}) };
      const through = new Date(`${input.to}T00:00:00Z`);
      const [patients, treatments, payments, totalRecords, settings, rateRows] = await Promise.all([
        db.patient.findMany({ where: patientWhere, select: { id: true, fullName: true } }),
        db.treatment.findMany({
          where: { patient: patientWhere, date: { lte: through }, voidReason: null, status: { not: "cancelled" } },
          include: { plan: { select: { number: true } } },
        }),
        db.payment.findMany({
          where: { patient: patientWhere, roomId, date: { lte: through } },
          include: { plan: { select: { number: true } } },
        }),
        db.clinicalRecord.findMany({
          where: { patient: patientWhere, kind: { in: ["plan_total", "unplan_total"] }, voidReason: null, date: { lte: through } },
          include: { plan: { select: { number: true } } }, orderBy: { recordedAt: "desc" },
        }),
        db.currencySettings.findUnique({ where: { id: roomId } }),
        db.exchangeRate.findMany({ where: { roomId, date: { lte: new Date(`${clinicDate()}T00:00:00Z`) } }, orderBy: { date: "desc" } }),
      ]);
      if (input.patientId && patients.length === 0) throw new AccessError("NOT_FOUND");
      const baseCurrency = (settings?.baseCurrency ?? "USD") as Currency;
      const rates = rateRows.map((row) => ({ date: dateText(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() }));
      const patientById = new Map(patients.map((patient) => [patient.id, patient]));
      const rateFor = (date: string) => selectExchangeRate(rates, date);
      const currentRate = rateFor(clinicDate());
      if (baseCurrency === "LBP" && !currentRate) throw new AccessError("VALIDATION_ERROR");
      const convert = (amount: string, from: Currency, date: string, preferredRate?: string | null) => {
        if (from === baseCurrency) return amount;
        const selected = preferredRate ? { date, lbpPerUsd: preferredRate } : rateFor(date);
        if (!selected) throw new AccessError("VALIDATION_ERROR");
        return convertCurrency(amount, from, baseCurrency, selected);
      };
      const rows: PatientStatementRow[] = [];
      const treatmentTotals = new Map<string, bigint>();
      for (const treatment of treatments) {
        const patient = patientById.get(treatment.patientId); if (!patient) continue;
        const date = dateText(treatment.date);
        const amount = moneyString(treatmentNet({ price: treatment.price.toFixed(2), discount: discountSchema.parse({ type: treatment.discountType, value: treatment.discountValue.toFixed(2) }) }));
        const group = `${treatment.patientId}:${treatment.planId ?? "unplanned"}`;
        treatmentTotals.set(group, (treatmentTotals.get(group) ?? 0n) + moneyCents(amount));
        rows.push({ id: treatment.id, type: "charge", entryKind: "procedure", date, patientId: patient.id,
          patientFileId: String(patient.id).padStart(6, "0"), patientName: patient.fullName,
          planNumber: treatment.plan?.number ?? null, description: (treatment.snapshot as { name?: string }).name ?? "Procedure",
          originalAmount: amount, originalCurrency: "USD", baseAmount: baseCurrency === "USD" ? amount : convertCurrency(amount, "USD", baseCurrency, currentRate), baseCurrency });
      }
      const latestTotals = new Map<string, typeof totalRecords[number]>();
      for (const record of totalRecords) {
        const key = `${record.patientId}:${record.planId ?? "unplanned"}`;
        if (!latestTotals.has(key)) latestTotals.set(key, record);
      }
      for (const [group, record] of latestTotals) {
        const patient = patientById.get(record.patientId); const subtotal = treatmentTotals.get(group) ?? 0n;
        if (!patient || subtotal === 0n) continue;
        const discount = discountCents(subtotal, discountSchema.parse((record.data as { discount: unknown }).discount));
        if (discount === 0n) continue;
        const amount = signedMoney(-discount); const date = dateText(record.date);
        rows.push({ id: record.id, type: "charge", entryKind: "discount", date, patientId: patient.id,
          patientFileId: String(patient.id).padStart(6, "0"), patientName: patient.fullName,
          planNumber: record.plan?.number ?? null, description: "", originalAmount: amount, originalCurrency: "USD",
          baseAmount: baseCurrency === "USD" ? amount : convertCurrency(amount, "USD", baseCurrency, currentRate), baseCurrency });
      }
      for (const payment of payments) {
        const patient = patientById.get(payment.patientId); if (!patient) continue;
        const date = dateText(payment.date); const originalCurrency = payment.currency as Currency;
        const baseAmount = payment.baseCurrency === baseCurrency ? payment.baseAmount.toFixed(2)
          : convert(payment.amount.toFixed(2), originalCurrency, date, payment.lbpPerUsd?.toFixed() ?? null);
        rows.push({ id: payment.id, type: "payment", entryKind: "payment", date, patientId: patient.id,
          patientFileId: String(patient.id).padStart(6, "0"), patientName: patient.fullName,
          planNumber: payment.plan?.number ?? null, description: payment.note, originalAmount: payment.amount.toFixed(2),
          originalCurrency, baseAmount, baseCurrency, method: payment.method as "cash" | "card" });
      }
      const openingRows = rows.filter((row) => row.date < input.from);
      const periodRows = rows.filter((row) => row.date >= input.from && row.date <= input.to);
      const sum = (source: PatientStatementRow[], type: "charge" | "payment") => source.filter((row) => row.type === type).reduce((total, row) => total + signedCents(row.baseAmount), 0n);
      const openingBalance = sum(openingRows, "charge") - sum(openingRows, "payment");
      const periodCharges = sum(periodRows, "charge"); const periodPayments = sum(periodRows, "payment");
      const filtered = input.activity === "all" ? periodRows : periodRows.filter((row) => row.type === input.activity);
      const value = (row: PatientStatementRow) => input.sort === "date" ? row.date : input.sort === "patient" ? row.patientName.toLocaleLowerCase()
        : input.sort === "description" ? row.description.toLocaleLowerCase() : input.sort === "charge" ? row.type === "charge" ? Number(row.baseAmount) : Number.NEGATIVE_INFINITY
          : row.type === "payment" ? Number(row.baseAmount) : Number.NEGATIVE_INFINITY;
      filtered.sort((left, right) => {
        const a = value(left); const b = value(right); const compared = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
        return (input.direction === "asc" ? compared : -compared) || (input.direction === "asc" ? left.id.localeCompare(right.id) : right.id.localeCompare(left.id));
      });
      return { total: filtered.length, rows: filtered.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), baseCurrency,
        openingBalance: signedMoney(openingBalance), periodCharges: signedMoney(periodCharges), periodPayments: signedMoney(periodPayments),
        closingBalance: signedMoney(openingBalance + periodCharges - periodPayments) };
    },
  };
}
