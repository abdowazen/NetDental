import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  BrandOptionList,
  SupplierOptionList,
  Supplier,
  SupplierInput,
  SupplierList,
  SupplierSearch,
  SupplyItem,
  SupplyItemInput,
  SupplyItemList,
  SupplyItemSearch,
} from "@clinic/shared";
import { AccessError } from "./access.js";

const includeSupplier = { supplier: { select: { name: true } } } as const;
type SupplyRow = Prisma.SupplyItemGetPayload<{ include: typeof includeSupplier }>;
const supplierInclude = { _count: { select: { supplyItems: true } } } as const;
type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;

function publicSupplier(row: SupplierRow): Supplier {
  return { id: row.id, name: row.name, phone: row.phone, address: row.address, active: row.active, assignedItems: row._count.supplyItems };
}

function publicItem(row: SupplyRow): SupplyItem {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    openingBalance: row.openingBalance.toFixed(3),
    defaultPrice: row.defaultPrice.toFixed(2),
    currency: row.currency,
    date: row.date.toISOString().slice(0, 10),
    expiryDate: row.expiryDate?.toISOString().slice(0, 10) ?? "",
    currentQuantity: row.currentQuantity.toFixed(3),
  };
}

export interface InventoryStore {
  searchSupplyItems(input: SupplyItemSearch, roomId: number): Promise<SupplyItemList>;
  findSupplyItem(id: number, roomId: number): Promise<SupplyItem | null>;
  createSupplyItem(input: SupplyItemInput, roomId: number): Promise<SupplyItem>;
  updateSupplyItem(id: number, input: SupplyItemInput, roomId: number): Promise<SupplyItem | null>;
  deleteSupplyItem(id: number, roomId: number): Promise<boolean>;
  searchSupplierOptions(q: string, roomId: number): Promise<SupplierOptionList>;
  searchBrandOptions(q: string, roomId: number): Promise<BrandOptionList>;
  searchSuppliers(input: SupplierSearch, roomId: number): Promise<SupplierList>;
  findSupplier(id: number, roomId: number): Promise<Supplier | null>;
  createSupplier(input: SupplierInput, roomId: number): Promise<Supplier>;
  updateSupplier(id: number, input: SupplierInput, roomId: number): Promise<Supplier | null>;
  setSupplierActive(id: number, active: boolean, roomId: number): Promise<Supplier | null>;
}

export function inventoryStore(db: PrismaClient): InventoryStore {
  async function supplierId(input: SupplyItemInput, roomId: number) {
    if (input.supplierId == null) return null;
    const supplier = await db.supplier.findFirst({ where: { id: input.supplierId, roomId }, select: { id: true } });
    if (!supplier) throw new AccessError("VALIDATION_ERROR");
    return supplier.id;
  }
  async function data(input: SupplyItemInput, roomId: number) {
    return {
      name: input.name,
      brand: input.brand,
      supplierId: await supplierId(input, roomId),
      defaultPrice: input.defaultPrice,
      currency: input.currency,
      date: new Date(`${input.date}T00:00:00.000Z`),
      expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00.000Z`) : null,
    };
  }
  return {
    async searchSupplyItems({ q, page, pageSize, sort, direction }, roomId) {
      const where: Prisma.SupplyItemWhereInput = {
        roomId,
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { supplier: { name: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      };
      const orderBy: Prisma.SupplyItemOrderByWithRelationInput = sort === "supplier"
        ? { supplier: { name: direction } }
        : { [sort]: direction };
      const [total, rows] = await db.$transaction([
        db.supplyItem.count({ where }),
        db.supplyItem.findMany({ where, include: includeSupplier, orderBy: [orderBy, { id: direction }], skip: (page - 1) * pageSize, take: pageSize }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { total, items: rows.map(publicItem) };
    },
    async findSupplyItem(id, roomId) {
      const row = await db.supplyItem.findFirst({ where: { id, roomId }, include: includeSupplier });
      return row ? publicItem(row) : null;
    },
    async createSupplyItem(input, roomId) {
      return publicItem(await db.supplyItem.create({ data: { ...(await data(input, roomId)), roomId, openingBalance: input.openingBalance, currentQuantity: input.openingBalance }, include: includeSupplier }));
    },
    async updateSupplyItem(id, input, roomId) {
      const itemData = await data(input, roomId);
      return db.$transaction(async (tx) => {
        const old = await tx.supplyItem.findFirst({ where: { id, roomId } });
        if (!old) return null;
        const nextOpening = new Prisma.Decimal(input.openingBalance);
        const delta = nextOpening.minus(old.openingBalance);
        if (delta.isNegative() && old.currentQuantity.lessThan(delta.abs())) throw new AccessError("VALIDATION_ERROR");
        const row = await tx.supplyItem.update({
          where: { id },
          data: {
            ...itemData,
            openingBalance: nextOpening,
            ...(delta.isZero() ? {} : { currentQuantity: delta.isPositive() ? { increment: delta } : { decrement: delta.abs() } }),
          },
          include: includeSupplier,
        });
        return publicItem(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },
    async deleteSupplyItem(id, roomId) {
      return (await db.supplyItem.deleteMany({ where: { id, roomId } })).count > 0;
    },
    async searchSupplierOptions(q, roomId) {
      const suppliers = await db.supplier.findMany({
        where: { roomId, active: true, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) },
        select: { id: true, name: true }, orderBy: { name: "asc" }, take: 20,
      });
      return { suppliers };
    },
    async searchBrandOptions(q, roomId) {
      const rows = await db.supplyItem.findMany({
        where: { roomId, ...(q ? { brand: { contains: q, mode: "insensitive" } } : {}) },
        select: { brand: true }, distinct: ["brand"], orderBy: { brand: "asc" }, take: 20,
      });
      return { brands: rows.map((row) => row.brand) };
    },
    async searchSuppliers({ q, page, pageSize, sort, direction }, roomId) {
      const where: Prisma.SupplierWhereInput = { roomId, ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
      ] } : {}) };
      const [total, rows] = await db.$transaction([
        db.supplier.count({ where }),
        db.supplier.findMany({ where, include: supplierInclude, orderBy: [{ [sort]: direction }, { id: direction }], skip: (page - 1) * pageSize, take: pageSize }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { total, suppliers: rows.map(publicSupplier) };
    },
    async findSupplier(id, roomId) {
      const row = await db.supplier.findFirst({ where: { id, roomId }, include: supplierInclude });
      return row ? publicSupplier(row) : null;
    },
    async createSupplier(input, roomId) {
      return publicSupplier(await db.supplier.create({ data: { ...input, roomId }, include: supplierInclude }));
    },
    async updateSupplier(id, input, roomId) {
      const result = await db.supplier.updateMany({ where: { id, roomId }, data: input });
      if (!result.count) return null;
      const row = await db.supplier.findUnique({ where: { id }, include: supplierInclude });
      return row ? publicSupplier(row) : null;
    },
    async setSupplierActive(id, active, roomId) {
      const result = await db.supplier.updateMany({ where: { id, roomId }, data: { active } });
      if (!result.count) return null;
      const row = await db.supplier.findUnique({ where: { id }, include: supplierInclude });
      return row ? publicSupplier(row) : null;
    },
  };
}
