import { Prisma, type BillExpense as Row, type PrismaClient } from "@prisma/client";
import {
  clinicDate, convertCurrency, moneyCents, moneyString, selectExchangeRate,
  type BillExpense, type BillExpenseInput, type BillExpenseList, type BillExpenseSearch, type BillingAnalyticsQuery,
  type BillingAnalyticsReport, type Currency, type ExchangeRate,
} from "@clinic/shared";
import { AccessError } from "./access.js";

const day = (value: Date) => value.toISOString().slice(0, 10);
export interface BillExpenseStore {
  searchBillExpenses(input: BillExpenseSearch, roomId: number): Promise<BillExpenseList>;
  findBillExpense(id: string, roomId: number): Promise<BillExpense | null>;
  createBillExpense(input: BillExpenseInput, roomId: number, actorId: string): Promise<BillExpense>;
  updateBillExpense(id: string, input: BillExpenseInput, roomId: number): Promise<BillExpense | null>;
  deleteBillExpense(id: string, roomId: number): Promise<boolean>;
  getBillingAnalytics(input: BillingAnalyticsQuery, roomId: number): Promise<BillingAnalyticsReport>;
}

export function billExpenseStore(db: PrismaClient): BillExpenseStore {
  const baseCurrency = async (roomId: number): Promise<Currency> => (await db.currencySettings.findUnique({ where: { id: roomId } }))?.baseCurrency ?? "USD";
  async function rate(roomId: number, date: string): Promise<ExchangeRate | null> {
    const rows = await db.exchangeRate.findMany({ where: { roomId, date: { gte: new Date(`${date.slice(0, 4)}-01-01T00:00:00Z`), lte: new Date(`${date}T00:00:00Z`) } }, orderBy: { date: "desc" } });
    return selectExchangeRate(rows.map((row) => ({ date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() })), date);
  }
  async function category(categoryId: number, roomId: number, requireActive: boolean) {
    const row = await db.billCategory.findFirst({ where: { id: categoryId, roomId, ...(requireActive ? { active: true } : {}) } });
    if (!row) throw new AccessError("NOT_FOUND"); return row;
  }
  async function laboratory(laboratoryId: number | undefined, roomId: number, requireActive: boolean) {
    if (!laboratoryId) return null;
    const row = await db.laboratory.findFirst({ where: { id: laboratoryId, roomId, ...(requireActive ? { active: true } : {}) }, select: { id: true, name: true } });
    if (!row) throw new AccessError("NOT_FOUND"); return row;
  }
  async function values(input: BillExpenseInput, roomId: number, requireActiveCategory: boolean, requireActiveLaboratory: boolean) {
    const [selectedCategory, selectedLaboratory, base, effectiveRate] = await Promise.all([
      category(input.categoryId, roomId, requireActiveCategory),
      laboratory(input.laboratoryId, roomId, requireActiveLaboratory),
      baseCurrency(roomId),
      rate(roomId, input.date),
    ]);
    if (selectedCategory.laboratoryBills !== Boolean(selectedLaboratory)) {
      throw new AccessError("VALIDATION_ERROR");
    }
    if (input.currency !== base && !effectiveRate) throw new AccessError("VALIDATION_ERROR");
    return { selectedCategory, selectedLaboratory, base, effectiveRate, baseAmount: convertCurrency(input.amount, input.currency, base, effectiveRate) };
  }
  async function publicExpense(row: Row, currentBase?: Currency): Promise<BillExpense> {
    const base = currentBase ?? await baseCurrency(row.roomId); const originalCurrency = row.currency as Currency;
    let converted = row.baseAmount.toFixed(2);
    if (row.baseCurrency !== base) {
      const snapshot = row.lbpPerUsd ? { date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() } : (await rate(row.roomId, day(row.date))) ?? (await rate(row.roomId, clinicDate()));
      if (originalCurrency !== base && !snapshot) throw new AccessError("VALIDATION_ERROR");
      converted = convertCurrency(row.amount.toFixed(2), originalCurrency, base, snapshot);
    }
    return { id: row.id, categoryId: row.categoryId, categoryName: row.categoryName,
      laboratoryId: row.laboratoryId ?? undefined, laboratoryName: row.laboratoryName,
      amount: row.amount.toFixed(2), currency: originalCurrency,
      baseCurrency: base, baseAmount: converted, lbpPerUsd: row.lbpPerUsd?.toFixed() ?? null, method: row.method as BillExpense["method"],
      date: day(row.date), note: row.note, actorId: row.actorId, createdAt: row.createdAt.toISOString() };
  }
  return {
    async searchBillExpenses(input, roomId) {
      const text = input.q.replace(/[%_]/g, "\\$&");
      const where: Prisma.BillExpenseWhereInput = { roomId,
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.from || input.to ? { date: { ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}), ...(input.to ? { lte: new Date(`${input.to}T00:00:00Z`) } : {}) } } : {}),
        ...(input.q ? { OR: [{ categoryName: { contains: text, mode: "insensitive" } }, { laboratoryName: { contains: text, mode: "insensitive" } }, { note: { contains: text, mode: "insensitive" } }] } : {}),
      };
      const [total, rows, amountRows, base] = await Promise.all([
        db.billExpense.count({ where }),
        db.billExpense.findMany({ where, orderBy: [{ [input.sort]: input.direction }, { createdAt: input.direction }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
        db.billExpense.findMany({ where, select: { id: true, roomId: true, categoryId: true, categoryName: true, laboratoryId: true, laboratoryName: true, amount: true, currency: true, baseCurrency: true, baseAmount: true, lbpPerUsd: true, method: true, date: true, note: true, actorId: true, createdAt: true, updatedAt: true } }),
        baseCurrency(roomId),
      ]);
      const [expenses, totals] = await Promise.all([Promise.all(rows.map((row) => publicExpense(row, base))), Promise.all(amountRows.map((row) => publicExpense(row, base)))]);
      return { total, expenses, baseCurrency: base, totalBaseAmount: moneyString(totals.reduce((sum, row) => sum + moneyCents(row.baseAmount), 0n)) };
    },
    async findBillExpense(id, roomId) {
      const row = await db.billExpense.findFirst({ where: { id, roomId } }); return row ? publicExpense(row) : null;
    },
    async createBillExpense(input, roomId, actorId) {
      const { selectedCategory, selectedLaboratory, base, effectiveRate, baseAmount } = await values(input, roomId, true, true);
      return publicExpense(await db.billExpense.create({ data: { ...input, laboratoryId: selectedLaboratory?.id ?? null, laboratoryName: selectedLaboratory?.name ?? null, roomId, actorId, categoryName: selectedCategory.name,
        amount: new Prisma.Decimal(input.amount), baseCurrency: base, baseAmount: new Prisma.Decimal(baseAmount),
        lbpPerUsd: effectiveRate ? new Prisma.Decimal(effectiveRate.lbpPerUsd) : null, date: new Date(`${input.date}T00:00:00Z`) } }), base);
    },
    async updateBillExpense(id, input, roomId) {
      const existing = await db.billExpense.findFirst({ where: { id, roomId } }); if (!existing) return null;
      const { selectedCategory, selectedLaboratory, base, effectiveRate, baseAmount } = await values(input, roomId, input.categoryId !== existing.categoryId, input.laboratoryId !== (existing.laboratoryId ?? undefined));
      return publicExpense(await db.billExpense.update({ where: { id, roomId }, data: { ...input, laboratoryId: selectedLaboratory?.id ?? null, laboratoryName: selectedLaboratory?.name ?? null, categoryName: selectedCategory.name,
        amount: new Prisma.Decimal(input.amount), baseCurrency: base, baseAmount: new Prisma.Decimal(baseAmount),
        lbpPerUsd: effectiveRate ? new Prisma.Decimal(effectiveRate.lbpPerUsd) : null, date: new Date(`${input.date}T00:00:00Z`) } }), base);
    },
    async deleteBillExpense(id, roomId) { return (await db.billExpense.deleteMany({ where: { id, roomId } })).count > 0; },
    async getBillingAnalytics(input, roomId) {
      const base = await baseCurrency(roomId);
      const whereFor = (from: string, to: string): Prisma.BillExpenseWhereInput => ({
        roomId,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        method: { in: input.methods },
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      });
      const [currentRows, comparisonRows, categoryOptions] = await Promise.all([
        db.billExpense.findMany({ where: whereFor(input.from, input.to) }),
        input.compareFrom && input.compareTo ? db.billExpense.findMany({ where: whereFor(input.compareFrom, input.compareTo) }) : Promise.resolve([]),
        db.billCategory.findMany({ where: { roomId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ]);
      const [current, comparison] = await Promise.all([
        Promise.all(currentRows.map((row) => publicExpense(row, base))),
        Promise.all(comparisonRows.map((row) => publicExpense(row, base))),
      ]);
      const cents = (rows: BillExpense[]) => rows.reduce((sum, row) => sum + moneyCents(row.baseAmount), 0n);
      const summary = (rows: BillExpense[]) => {
        const total = cents(rows);
        return { total: moneyString(total), count: rows.length, average: moneyString(rows.length ? total / BigInt(rows.length) : 0n) };
      };
      const bucketKey = (date: string, period: BillingAnalyticsQuery["period"]) => period === "monthly" ? date.slice(8, 10) : period === "yearly" ? date.slice(5, 7) : date;
      const sumBuckets = (rows: BillExpense[]) => {
        const result = new Map<string, bigint>();
        for (const row of rows) { const key = bucketKey(row.date, input.period); result.set(key, (result.get(key) ?? 0n) + moneyCents(row.baseAmount)); }
        return result;
      };
      const currentBuckets = sumBuckets(current); const comparisonBuckets = sumBuckets(comparison);
      const keys = input.period === "monthly"
        ? Array.from({ length: new Date(Date.UTC(Number(input.from.slice(0, 4)), Number(input.from.slice(5, 7)), 0)).getUTCDate() }, (_, index) => String(index + 1).padStart(2, "0"))
        : input.period === "yearly" ? Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))
          : [...new Set([...currentBuckets.keys(), ...comparisonBuckets.keys()])].sort();
      const categoryMap = new Map<number, { categoryName: string; total: bigint; count: number }>();
      const methodMap = new Map<BillExpense["method"], { total: bigint; count: number }>();
      for (const row of current) {
        const categoryValue = categoryMap.get(row.categoryId) ?? { categoryName: row.categoryName, total: 0n, count: 0 };
        categoryValue.total += moneyCents(row.baseAmount); categoryValue.count += 1; categoryMap.set(row.categoryId, categoryValue);
        const methodValue = methodMap.get(row.method) ?? { total: 0n, count: 0 };
        methodValue.total += moneyCents(row.baseAmount); methodValue.count += 1; methodMap.set(row.method, methodValue);
      }
      const value = (row: BillExpense) => input.sort === "baseAmount" ? moneyCents(row.baseAmount) : input.sort === "categoryName" ? row.categoryName.toLocaleLowerCase() : row[input.sort];
      const sorted = [...current].sort((left, right) => { const a = value(left); const b = value(right); const order = a < b ? -1 : a > b ? 1 : 0; return (input.direction === "asc" ? order : -order) || right.createdAt.localeCompare(left.createdAt); });
      const currentSummary = summary(current); const comparisonSummary = summary(comparison);
      const previousCents = cents(comparison); const currentCents = cents(current);
      return {
        baseCurrency: base, from: input.from, to: input.to, summary: currentSummary,
        comparison: input.compareFrom && input.compareTo ? { ...comparisonSummary, from: input.compareFrom, to: input.compareTo, changePercent: previousCents === 0n ? null : ((Number(currentCents - previousCents) / Number(previousCents)) * 100).toFixed(1) } : null,
        buckets: keys.map((key) => ({ key, current: moneyString(currentBuckets.get(key) ?? 0n), comparison: moneyString(comparisonBuckets.get(key) ?? 0n) })),
        categories: [...categoryMap.entries()].map(([categoryId, item]) => ({ categoryId, categoryName: item.categoryName, total: moneyString(item.total), count: item.count })).sort((a, b) => Number(b.total) - Number(a.total)),
        categoryOptions,
        methods: [...methodMap.entries()].map(([method, item]) => ({ method, total: moneyString(item.total), count: item.count })).sort((a, b) => Number(b.total) - Number(a.total)),
        expenses: sorted.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: sorted.length,
      };
    },
  };
}
