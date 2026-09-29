import type { PrismaClient } from "@prisma/client";
import { clinicDate, convertCurrency, discountSchema, moneyCents, moneyString, selectExchangeRate, treatmentNet, type Currency, type DashboardPeriod, type DashboardSummary, type ExchangeRate } from "@clinic/shared";
import { AccessError } from "./access.js";

const day = (value: Date) => value.toISOString().slice(0, 10);
const date = (value: string) => new Date(`${value}T00:00:00Z`);
function signed(cents: bigint) { const negative = cents < 0n; const value = negative ? -cents : cents; return `${negative ? "-" : ""}${value / 100n}.${String(value % 100n).padStart(2, "0")}`; }

export interface DashboardStore { getDashboard(roomId: number, period: DashboardPeriod): Promise<DashboardSummary>; }
export function dashboardStore(db: PrismaClient): DashboardStore {
  return { async getDashboard(roomId, period) {
    const today = clinicDate(); const year = today.slice(0, 4); const month = today.slice(5, 7);
    const startText = period === "monthly" ? `${year}-${month}-01` : `${year}-01-01`;
    const endDate = period === "monthly" ? new Date(Date.UTC(Number(year), Number(month), 1)) : new Date(Date.UTC(Number(year) + 1, 0, 1));
    const startDate = date(startText); const todayDate = date(today); const tomorrow = new Date(todayDate); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const [settings, rates, treatments, allTreatments, periodPayments, allPayments, labs, completedToday, registeredPatients] = await Promise.all([
      db.currencySettings.findUnique({ where: { id: roomId } }),
      db.exchangeRate.findMany({ where: { roomId, date: { gte: date(`${year}-01-01`), lte: todayDate } }, orderBy: { date: "desc" } }),
      db.treatment.findMany({ where: { patient: { roomId }, date: { gte: startDate, lt: endDate }, voidReason: null, status: { not: "cancelled" } } }),
      db.treatment.findMany({ where: { patient: { roomId }, voidReason: null, status: { not: "cancelled" } } }),
      db.payment.findMany({ where: { roomId, date: { gte: startDate, lt: endDate } } }),
      db.payment.findMany({ where: { roomId } }),
      db.labRequest.findMany({ where: { roomId, status: { not: "voided" } } }),
      db.treatmentEvent.findMany({ where: { status: "completed", date: { gte: todayDate, lt: tomorrow }, treatment: { patient: { roomId }, voidReason: null } }, select: { treatment: { select: { patientId: true } } } }),
      db.patient.findMany({ where: { roomId, createdAt: { gte: startDate, lt: endDate } }, select: { createdAt: true } }),
    ]);
    const currency = (settings?.baseCurrency ?? "USD") as Currency;
    const rate = selectExchangeRate(rates.map((row) => ({ date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() })), today);
    if (currency === "LBP" && !rate) throw new AccessError("VALIDATION_ERROR");
    const usdToBase = (cents: bigint) => moneyCents(convertCurrency(moneyString(cents), "USD", currency, rate));
    const historicalRates = new Map<string, Promise<ExchangeRate | null>>();
    const historicalRate = (paymentDate: string) => {
      const existing = historicalRates.get(paymentDate);
      if (existing) return existing;
      const pending = db.exchangeRate.findMany({
        where: { roomId, date: { gte: date(`${paymentDate.slice(0, 4)}-01-01`), lte: date(paymentDate) } },
        orderBy: { date: "desc" },
      }).then((rows) => selectExchangeRate(rows.map((row) => ({ date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() })), paymentDate));
      historicalRates.set(paymentDate, pending);
      return pending;
    };
    const paymentToBase = async (row: typeof allPayments[number]) => {
      if (row.baseCurrency === currency) return moneyCents(row.baseAmount.toFixed(2));
      const originalCurrency = row.currency as Currency;
      const snapshot: ExchangeRate | null = row.lbpPerUsd
        ? { date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() }
        : originalCurrency === currency ? null : (await historicalRate(day(row.date))) ?? rate;
      try { return moneyCents(convertCurrency(row.amount.toFixed(2), row.currency as Currency, currency, snapshot)); }
      catch { throw new AccessError("VALIDATION_ERROR"); }
    };
    const paymentValues = new Map(await Promise.all(allPayments.map(async (row) => [row.id, await paymentToBase(row)] as const)));
    const net = (row: typeof treatments[number]) => treatmentNet({ price: row.price.toFixed(2), discount: discountSchema.parse({ type: row.discountType, value: row.discountValue.toFixed(2) }) });
    const bucketKeys = period === "monthly" ? Array.from({ length: 5 }, (_, i) => `W${i + 1}`) : Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const bucket = (value: Date) => period === "monthly" ? `W${Math.min(5, Math.floor((value.getUTCDate() - 1) / 7) + 1)}` : day(value).slice(0, 7);
    const buckets = new Map(bucketKeys.map((key) => [key, { key, charges: 0n, payments: 0n, labRequested: 0n, labReceived: 0n, registrations: 0 }]));
    treatments.forEach((row) => { buckets.get(bucket(row.date))!.charges += usdToBase(net(row)); });
    periodPayments.forEach((row) => { buckets.get(bucket(row.date))!.payments += paymentValues.get(row.id) ?? 0n; });
    registeredPatients.forEach((row) => { buckets.get(bucket(row.createdAt))!.registrations += 1; });
    labs.filter((row) => row.requestDate && row.requestDate >= startDate && row.requestDate < endDate && ["requested","received"].includes(row.status)).forEach((row) => {
      const item = buckets.get(bucket(row.requestDate!))!; const value = usdToBase(moneyCents(row.cost.toFixed(2)));
      if (row.status === "received") item.labReceived += value; else item.labRequested += value;
    });
    const procedureCounts = new Map<string, number>();
    treatments.forEach((row) => { const name = (row.snapshot as { name?: string }).name ?? "Procedure"; procedureCounts.set(name, (procedureCounts.get(name) ?? 0) + 1); });
    const totalCharges = allTreatments.reduce((sum, row) => sum + usdToBase(treatmentNet({ price: row.price.toFixed(2), discount: discountSchema.parse({ type: row.discountType, value: row.discountValue.toFixed(2) }) })), 0n);
    const totalPayments = allPayments.reduce((sum, row) => sum + (paymentValues.get(row.id) ?? 0n), 0n);
    const todayPayments = periodPayments.filter((row) => day(row.date) === today).reduce((sum, row) => sum + (paymentValues.get(row.id) ?? 0n), 0n);
    return { period, currency, patientsTreatedToday: new Set(completedToday.map((row) => row.treatment.patientId)).size,
      paymentsReceivedToday: moneyString(todayPayments), outstandingBalance: signed(totalCharges - totalPayments),
      pendingLabRequests: labs.filter((row) => ["to_request","requested"].includes(row.status)).length,
      buckets: [...buckets.values()].map((item) => ({ key: item.key, charges: moneyString(item.charges), payments: moneyString(item.payments), labRequested: moneyString(item.labRequested), labReceived: moneyString(item.labReceived), registrations: item.registrations })),
      procedures: [...procedureCounts].map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5),
    };
  } };
}
