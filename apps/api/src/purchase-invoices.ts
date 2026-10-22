import { Prisma, type PrismaClient } from "@prisma/client";
import {
  clinicDate, convertCurrency, moneyCents, moneyString, selectExchangeRate,
  type Currency, type ExchangeRate, type PurchaseInvoice, type PurchaseInvoiceInput,
  type PurchaseInvoiceList, type PurchaseInvoiceSearch, type PurchaseProductOptionList,
  type InventoryAnalyticsQuery, type InventoryAnalyticsReport,
} from "@clinic/shared";
import { AccessError } from "./access.js";

const invoiceInclude = { lines: { include: { item: { include: { unit: true } } }, orderBy: { id: "asc" as const } } } as const;
type InvoiceRow = Prisma.PurchaseInvoiceGetPayload<{ include: typeof invoiceInclude }>;
type Db = PrismaClient | Prisma.TransactionClient;
const day = (value: Date) => value.toISOString().slice(0, 10);

export interface PurchaseInvoiceStore {
  searchPurchaseInvoices(input: PurchaseInvoiceSearch, roomId: number): Promise<PurchaseInvoiceList>;
  findPurchaseInvoice(id: number, roomId: number): Promise<PurchaseInvoice | null>;
  createPurchaseInvoice(input: PurchaseInvoiceInput, roomId: number, actorId: string): Promise<PurchaseInvoice>;
  updatePurchaseInvoice(id: number, input: PurchaseInvoiceInput, roomId: number): Promise<PurchaseInvoice | null>;
  deletePurchaseInvoice(id: number, roomId: number): Promise<boolean>;
  purchaseProducts(supplierId: number, roomId: number, date: string): Promise<PurchaseProductOptionList>;
  getInventoryAnalytics(input: InventoryAnalyticsQuery, roomId: number): Promise<InventoryAnalyticsReport>;
}

export function purchaseInvoiceStore(db: PrismaClient): PurchaseInvoiceStore {
  const baseCurrency = async (client: Db, roomId: number): Promise<Currency> => (await client.currencySettings.findUnique({ where: { id: roomId } }))?.baseCurrency ?? "USD";
  async function rate(client: Db, roomId: number, date: string): Promise<ExchangeRate | null> {
    const rows = await client.exchangeRate.findMany({ where: { roomId, date: { gte: new Date(`${date.slice(0, 4)}-01-01T00:00:00Z`), lte: new Date(`${date}T00:00:00Z`) } }, orderBy: { date: "desc" } });
    return selectExchangeRate(rows.map((row) => ({ date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() })), date);
  }
  async function publicInvoice(row: InvoiceRow, currentBase?: Currency): Promise<PurchaseInvoice> {
    const base = currentBase ?? await baseCurrency(db, row.roomId); let baseTotal = row.baseTotal.toFixed(2);
    if (row.baseCurrency !== base) {
      const snapshot = row.lbpPerUsd ? { date: day(row.date), lbpPerUsd: row.lbpPerUsd.toFixed() } : (await rate(db, row.roomId, day(row.date))) ?? (await rate(db, row.roomId, clinicDate()));
      if (row.currency !== base && !snapshot) throw new AccessError("VALIDATION_ERROR");
      baseTotal = convertCurrency(row.totalAmount.toFixed(2), row.currency, base, snapshot);
    }
    return { id: row.id, invoiceNumber: `INV-${String(row.id).padStart(6, "0")}`, supplierId: row.supplierId, supplierName: row.supplierName,
      paymentType: row.paymentType as PurchaseInvoice["paymentType"], currency: row.currency, totalAmount: row.totalAmount.toFixed(2), baseCurrency: base,
      baseTotal, lbpPerUsd: row.lbpPerUsd?.toFixed() ?? null, date: day(row.date), note: row.note, actorId: row.actorId, createdAt: row.createdAt.toISOString(),
      lines: row.lines.map((line) => ({ id: line.id, itemId: line.itemId, itemName: line.itemName, brand: line.brand, unitName: line.item.unit.name, unitSymbol: line.item.unit.symbol,
        defaultPrice: line.defaultPrice.toFixed(2), purchasePrice: line.purchasePrice.toFixed(2),
        quantity: line.quantity.toFixed(3), expiryDate: line.expiryDate ? day(line.expiryDate) : "", description: line.description, lineTotal: line.lineTotal.toFixed(2) })) };
  }
  async function prepared(client: Db, input: PurchaseInvoiceInput, roomId: number, requireActive: boolean, old?: InvoiceRow) {
    const supplier = await client.supplier.findFirst({ where: { id: input.supplierId, roomId, ...(requireActive ? { active: true } : {}) } });
    if (!supplier) throw new AccessError("VALIDATION_ERROR");
    const ids = input.lines.map((line) => line.itemId);
    const items = await client.supplyItem.findMany({ where: { id: { in: ids }, roomId, suppliers: { some: { supplierId: input.supplierId } } } });
    if (items.length !== ids.length) throw new AccessError("VALIDATION_ERROR");
    const byId = new Map(items.map((item) => [item.id, item])); const previous = new Map(old?.lines.map((line) => [line.itemId, line]) ?? []);
    let total = new Prisma.Decimal(0);
    const lines = input.lines.map((line) => {
      const item = byId.get(line.itemId)!; const prior = previous.get(line.itemId);
      const lineTotal = new Prisma.Decimal(line.purchasePrice).mul(line.quantity).toDecimalPlaces(2); total = total.plus(lineTotal);
      return { itemId: item.id, itemName: item.name, brand: item.brand, defaultPrice: prior?.defaultPrice ?? item.defaultPrice,
        purchasePrice: new Prisma.Decimal(line.purchasePrice), quantity: new Prisma.Decimal(line.quantity), description: line.description,
        expiryDate: line.expiryDate ? new Date(`${line.expiryDate}T00:00:00Z`) : null, lineTotal };
    });
    const base = await baseCurrency(client, roomId); const effectiveRate = await rate(client, roomId, input.date);
    if (input.currency !== base && !effectiveRate) throw new AccessError("VALIDATION_ERROR");
    const baseTotal = convertCurrency(total.toFixed(2), input.currency, base, effectiveRate);
    return { supplier, lines, total, base, effectiveRate, baseTotal };
  }
  async function adjustStock(client: Prisma.TransactionClient, oldLines: InvoiceRow["lines"], newLines: { itemId: number; quantity: Prisma.Decimal }[]) {
    const old = new Map(oldLines.map((line) => [line.itemId, line.quantity])); const next = new Map(newLines.map((line) => [line.itemId, line.quantity]));
    for (const itemId of new Set([...old.keys(), ...next.keys()])) {
      const delta = (next.get(itemId) ?? new Prisma.Decimal(0)).minus(old.get(itemId) ?? new Prisma.Decimal(0));
      if (delta.isPositive()) await client.supplyItem.update({ where: { id: itemId }, data: { currentQuantity: { increment: delta } } });
      else if (delta.isNegative()) {
        const amount = delta.abs(); const changed = await client.supplyItem.updateMany({ where: { id: itemId, currentQuantity: { gte: amount } }, data: { currentQuantity: { decrement: amount } } });
        if (!changed.count) throw new AccessError("VALIDATION_ERROR");
      }
    }
  }
  return {
    async searchPurchaseInvoices(input, roomId) {
      const invoiceId = /^(?:INV-)?\d+$/i.test(input.q) ? Number(input.q.replace(/^INV-/i, "")) : 0;
      const where: Prisma.PurchaseInvoiceWhereInput = { roomId, ...(input.supplierId ? { supplierId: input.supplierId } : {}), ...(input.paymentType ? { paymentType: input.paymentType } : {}),
        ...(input.from || input.to ? { date: { ...(input.from ? { gte: new Date(`${input.from}T00:00:00Z`) } : {}), ...(input.to ? { lte: new Date(`${input.to}T00:00:00Z`) } : {}) } } : {}),
        ...(input.q ? { OR: [...(Number.isSafeInteger(invoiceId) && invoiceId > 0 ? [{ id: invoiceId }] : []), { supplierName: { contains: input.q, mode: "insensitive" as const } }, { note: { contains: input.q, mode: "insensitive" as const } }] } : {}) };
      const [total, rows, allRows, base] = await Promise.all([db.purchaseInvoice.count({ where }), db.purchaseInvoice.findMany({ where, include: invoiceInclude, orderBy: [{ [input.sort]: input.direction }, { id: input.direction }], skip: (input.page - 1) * input.pageSize, take: input.pageSize }), db.purchaseInvoice.findMany({ where, include: invoiceInclude }), baseCurrency(db, roomId)]);
      const [invoices, totals] = await Promise.all([Promise.all(rows.map((row) => publicInvoice(row, base))), Promise.all(allRows.map((row) => publicInvoice(row, base)))]);
      return { total, invoices, baseCurrency: base, totalBaseAmount: moneyString(totals.reduce((sum, row) => sum + moneyCents(row.baseTotal), 0n)) };
    },
    async findPurchaseInvoice(id, roomId) { const row = await db.purchaseInvoice.findFirst({ where: { id, roomId }, include: invoiceInclude }); return row ? publicInvoice(row) : null; },
    async createPurchaseInvoice(input, roomId, actorId) {
      return db.$transaction(async (tx) => { const value = await prepared(tx, input, roomId, true); await adjustStock(tx, [], value.lines);
        const row = await tx.purchaseInvoice.create({ data: { roomId, supplierId: input.supplierId, supplierName: value.supplier.name, paymentType: input.paymentType, currency: input.currency,
          totalAmount: value.total, baseCurrency: value.base, baseTotal: new Prisma.Decimal(value.baseTotal), lbpPerUsd: value.effectiveRate ? new Prisma.Decimal(value.effectiveRate.lbpPerUsd) : null,
          date: new Date(`${input.date}T00:00:00Z`), note: input.note, actorId, lines: { create: value.lines } }, include: invoiceInclude }); return publicInvoice(row, value.base); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },
    async updatePurchaseInvoice(id, input, roomId) {
      return db.$transaction(async (tx) => { const old = await tx.purchaseInvoice.findFirst({ where: { id, roomId }, include: invoiceInclude }); if (!old) return null;
        const value = await prepared(tx, input, roomId, input.supplierId !== old.supplierId, old); await adjustStock(tx, old.lines, value.lines); await tx.purchaseInvoiceLine.deleteMany({ where: { invoiceId: id } });
        const row = await tx.purchaseInvoice.update({ where: { id }, data: { supplierId: input.supplierId, supplierName: value.supplier.name, paymentType: input.paymentType, currency: input.currency,
          totalAmount: value.total, baseCurrency: value.base, baseTotal: new Prisma.Decimal(value.baseTotal), lbpPerUsd: value.effectiveRate ? new Prisma.Decimal(value.effectiveRate.lbpPerUsd) : null,
          date: new Date(`${input.date}T00:00:00Z`), note: input.note, lines: { create: value.lines } }, include: invoiceInclude }); return publicInvoice(row, value.base); }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },
    async deletePurchaseInvoice(id, roomId) { return db.$transaction(async (tx) => { const row = await tx.purchaseInvoice.findFirst({ where: { id, roomId }, include: invoiceInclude }); if (!row) return false; await adjustStock(tx, row.lines, []); await tx.purchaseInvoice.delete({ where: { id } }); return true; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); },
    async purchaseProducts(supplierId, roomId, date) { const [rows, effectiveRate] = await Promise.all([db.supplyItem.findMany({ where: { roomId, suppliers: { some: { supplierId } } }, include: { product: { select: { name: true } }, unit: true }, orderBy: [{ name: "asc" }, { brand: "asc" }] }), rate(db, roomId, date)]); return { products: rows.map((item) => ({ id: item.id, productId: item.productId, name: item.product.name, brand: item.brand, unitName: item.unit.name, unitSymbol: item.unit.symbol, defaultPrice: item.defaultPrice.toFixed(2), currency: item.currency, expiryDate: item.expiryDate ? day(item.expiryDate) : "", currentQuantity: item.currentQuantity.toFixed(3) })), effectiveRate }; },
    async getInventoryAnalytics(input, roomId) {
      const base = await baseCurrency(db, roomId);
      const whereFor = (from: string, to: string): Prisma.PurchaseInvoiceWhereInput => ({ roomId,
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, paymentType: { in: input.paymentTypes },
        ...(input.supplierId ? { supplierId: input.supplierId } : {}),
        ...(input.productId || input.brand ? { lines: { some: { ...(input.productId ? { item: { productId: input.productId } } : {}), ...(input.brand ? { brand: input.brand } : {}) } } } : {}),
      });
      const [currentRows, comparisonRows, supplierOptions, productOptions, stockItems] = await Promise.all([
        db.purchaseInvoice.findMany({ where: whereFor(input.from, input.to), include: invoiceInclude }),
        input.compareFrom && input.compareTo ? db.purchaseInvoice.findMany({ where: whereFor(input.compareFrom, input.compareTo), include: invoiceInclude }) : Promise.resolve([]),
        db.supplier.findMany({ where: { roomId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.supplyProduct.findMany({ where: { roomId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.supplyItem.findMany({ where: { roomId, ...(input.productId ? { productId: input.productId } : {}), ...(input.brand ? { brand: input.brand } : {}), ...(input.supplierId ? { suppliers: { some: { supplierId: input.supplierId } } } : {}) }, include: { product: { select: { name: true } }, suppliers: { include: { supplier: { select: { name: true } } } } }, orderBy: [{ name: "asc" }, { brand: "asc" }] }),
      ]);
      const [current, compared] = await Promise.all([Promise.all(currentRows.map((row) => publicInvoice(row, base))), Promise.all(comparisonRows.map((row) => publicInvoice(row, base)))]);
      const cents = (rows: PurchaseInvoice[]) => rows.reduce((sum, row) => sum + moneyCents(row.baseTotal), 0n);
      const summary = (rows: PurchaseInvoice[]) => { const total = cents(rows); return { total: moneyString(total), count: rows.length, average: moneyString(rows.length ? total / BigInt(rows.length) : 0n) }; };
      const bucketKey = (date: string) => input.period === "monthly" ? date.slice(8, 10) : input.period === "yearly" ? date.slice(5, 7) : date;
      const grouped = (rows: PurchaseInvoice[]) => { const map = new Map<string, bigint>(); for (const row of rows) { const key = bucketKey(row.date); map.set(key, (map.get(key) ?? 0n) + moneyCents(row.baseTotal)); } return map; };
      const currentBuckets = grouped(current), compareBuckets = grouped(compared);
      const keys = input.period === "monthly" ? Array.from({ length: new Date(Date.UTC(+input.from.slice(0,4), +input.from.slice(5,7), 0)).getUTCDate() }, (_, i) => String(i + 1).padStart(2, "0")) : input.period === "yearly" ? Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")) : [...new Set([...currentBuckets.keys(), ...compareBuckets.keys()])].sort();
      const supplierMap = new Map<number, { name: string; total: bigint; count: number }>(); const paymentMap = new Map<PurchaseInvoice["paymentType"], { total: bigint; count: number }>();
      const itemMap = new Map(stockItems.map((item) => [item.id, item]));
      const allReferencedItems = await db.supplyItem.findMany({ where: { roomId, id: { in: [...new Set(current.flatMap((invoice) => invoice.lines.map((line) => line.itemId)))] } }, include: { product: { select: { name: true } } } });
      for (const item of allReferencedItems) itemMap.set(item.id, item as typeof stockItems[number]);
      const productMap = new Map<number, { name: string; brands: Set<string>; total: bigint; quantity: Prisma.Decimal }>();
      for (const invoice of current) {
        const supplier = supplierMap.get(invoice.supplierId) ?? { name: invoice.supplierName, total: 0n, count: 0 }; supplier.total += moneyCents(invoice.baseTotal); supplier.count++; supplierMap.set(invoice.supplierId, supplier);
        const payment = paymentMap.get(invoice.paymentType) ?? { total: 0n, count: 0 }; payment.total += moneyCents(invoice.baseTotal); payment.count++; paymentMap.set(invoice.paymentType, payment);
        const originalCents = moneyCents(invoice.totalAmount), baseCents = moneyCents(invoice.baseTotal);
        for (const line of invoice.lines) { const variant = itemMap.get(line.itemId); if (!variant || input.productId && variant.productId !== input.productId || input.brand && line.brand !== input.brand) continue; const item = productMap.get(variant.productId) ?? { name: variant.product.name, brands: new Set<string>(), total: 0n, quantity: new Prisma.Decimal(0) }; item.brands.add(line.brand); item.total += originalCents ? moneyCents(line.lineTotal) * baseCents / originalCents : 0n; item.quantity = item.quantity.plus(line.quantity); productMap.set(variant.productId, item); }
      }
      const sortValue = (row: PurchaseInvoice): string | bigint => input.sort === "baseTotal" ? moneyCents(row.baseTotal) : input.sort === "invoiceNumber" ? row.invoiceNumber : row[input.sort];
      const sorted = [...current].sort((a,b) => { const left=sortValue(a), right=sortValue(b); const order=left<right?-1:left>right?1:0; return (input.direction === "asc" ? order : -order) || b.id-a.id; });
      const currentSummary=summary(current), comparisonSummary=summary(compared), oldTotal=cents(compared), newTotal=cents(current);
      return { baseCurrency: base, from: input.from, to: input.to, summary: currentSummary,
        comparison: input.compareFrom && input.compareTo ? { ...comparisonSummary, from: input.compareFrom, to: input.compareTo, changePercent: oldTotal === 0n ? null : ((Number(newTotal-oldTotal)/Number(oldTotal))*100).toFixed(1) } : null,
        buckets: keys.map((key) => ({ key, current: moneyString(currentBuckets.get(key) ?? 0n), comparison: moneyString(compareBuckets.get(key) ?? 0n) })),
        suppliers: [...supplierMap.entries()].map(([supplierId,v]) => ({ supplierId, supplierName:v.name, total:moneyString(v.total), count:v.count })).sort((a,b)=>Number(b.total)-Number(a.total)),
        products: [...productMap.entries()].map(([productId,v]) => ({ productId, productName:v.name, brands:[...v.brands].sort(), total:moneyString(v.total), quantity:v.quantity.toFixed(3) })).sort((a,b)=>Number(b.total)-Number(a.total)),
        stockProducts: [...stockItems.reduce((map, item) => { const value = map.get(item.productId) ?? { productId: item.productId, productName: item.product.name, totalQuantity: new Prisma.Decimal(0), variants: [] as { itemId: number; brand: string; quantity: string; suppliers: string[] }[] }; value.totalQuantity = value.totalQuantity.plus(item.currentQuantity); value.variants.push({ itemId: item.id, brand: item.brand, quantity: item.currentQuantity.toFixed(3), suppliers: item.suppliers.map((link) => link.supplier.name).sort() }); map.set(item.productId, value); return map; }, new Map<number, { productId: number; productName: string; totalQuantity: Prisma.Decimal; variants: { itemId: number; brand: string; quantity: string; suppliers: string[] }[] }>()).values()].map((value) => ({ ...value, totalQuantity: value.totalQuantity.toFixed(3) })).sort((a,b)=>Number(b.totalQuantity)-Number(a.totalQuantity)),
        paymentTypes: [...paymentMap.entries()].map(([paymentType,v]) => ({ paymentType,total:moneyString(v.total),count:v.count })).sort((a,b)=>Number(b.total)-Number(a.total)),
        supplierOptions, productOptions, brandOptions:[...new Set(stockItems.map((item)=>item.brand))].sort(), invoices:sorted.slice((input.page-1)*input.pageSize,input.page*input.pageSize), total:sorted.length };
    },
  };
}
