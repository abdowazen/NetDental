import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  BrandOptionList,
  UnitOptionList,
  ProductOptionList,
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

const includeItem = { unit: true, product: { select: { id: true, name: true } }, suppliers: { include: { supplier: { select: { id: true, name: true } } }, orderBy: { supplier: { name: "asc" as const } } } } as const;
type SupplyRow = Prisma.SupplyItemGetPayload<{ include: typeof includeItem }>;
const supplierInclude = { _count: { select: { supplyItemLinks: true } } } as const;
type SupplierRow = Prisma.SupplierGetPayload<{ include: typeof supplierInclude }>;

function publicSupplier(row: SupplierRow): Supplier {
  return { id: row.id, name: row.name, phone: row.phone, address: row.address, active: row.active, assignedItems: row._count.supplyItemLinks };
}

function publicItem(row: SupplyRow): SupplyItem {
  return {
    id: row.id,
    productId: row.productId,
    name: row.product.name,
    brand: row.brand,
    unitId: row.unitId,
    unitName: row.unit.name,
    unitSymbol: row.unit.symbol,
    supplierIds: row.suppliers.map((link) => link.supplierId),
    supplierNames: row.suppliers.map((link) => link.supplier.name),
    openingBalance: row.openingBalance.toFixed(3),
    defaultPrice: row.defaultPrice.toFixed(2),
    currency: row.currency,
    date: row.date.toISOString().slice(0, 10),
    expiryDate: row.expiryDate?.toISOString().slice(0, 10) ?? "",
    currentQuantity: row.currentQuantity.toFixed(3),
  };
}

export interface InventoryStore {
  listUnits(): Promise<UnitOptionList>;
  searchSupplyItems(input: SupplyItemSearch, roomId: number): Promise<SupplyItemList>;
  findSupplyItem(id: number, roomId: number): Promise<SupplyItem | null>;
  createSupplyItem(input: SupplyItemInput, roomId: number): Promise<SupplyItem>;
  updateSupplyItem(id: number, input: SupplyItemInput, roomId: number): Promise<SupplyItem | null>;
  deleteSupplyItem(id: number, roomId: number): Promise<boolean>;
  searchSupplierOptions(q: string, roomId: number): Promise<SupplierOptionList>;
  searchBrandOptions(q: string, roomId: number): Promise<BrandOptionList>;
  searchProductOptions(q: string, roomId: number): Promise<ProductOptionList>;
  searchSuppliers(input: SupplierSearch, roomId: number): Promise<SupplierList>;
  findSupplier(id: number, roomId: number): Promise<Supplier | null>;
  createSupplier(input: SupplierInput, roomId: number): Promise<Supplier>;
  updateSupplier(id: number, input: SupplierInput, roomId: number): Promise<Supplier | null>;
  setSupplierActive(id: number, active: boolean, roomId: number): Promise<Supplier | null>;
}

export function inventoryStore(db: PrismaClient): InventoryStore {
  async function productAndSuppliers(client: Prisma.TransactionClient, input: SupplyItemInput, roomId: number) {
    if (!await client.unit.findUnique({ where: { id: input.unitId } })) throw new AccessError("VALIDATION_ERROR");
    const product = await client.supplyProduct.findFirst({ where: { roomId, name: { equals: input.name, mode: "insensitive" } } })
      ?? await client.supplyProduct.create({ data: { roomId, name: input.name } });
    const supplierCount = input.supplierIds.length ? await client.supplier.count({ where: { id: { in: input.supplierIds }, roomId, active: true } }) : 0;
    if (supplierCount !== input.supplierIds.length) throw new AccessError("VALIDATION_ERROR");
    return { product, supplierIds: input.supplierIds };
  }
  function data(input: SupplyItemInput, productId: number, productName: string) {
    return {
      name: productName,
      brand: input.brand,
      unitId: input.unitId,
      productId,
      defaultPrice: input.defaultPrice,
      currency: input.currency,
      date: new Date(`${input.date}T00:00:00.000Z`),
      expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00.000Z`) : null,
    };
  }
  return {
    async listUnits() {
      return { units: await db.unit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, symbol: true } }) };
    },
    async searchSupplyItems({ q, page, pageSize, sort, direction }, roomId) {
      const where: Prisma.SupplyItemWhereInput = {
        roomId,
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { brand: { contains: q, mode: "insensitive" } },
          { suppliers: { some: { supplier: { name: { contains: q, mode: "insensitive" } } } } },
        ] } : {}),
      };
      const orderBy: Prisma.SupplyItemOrderByWithRelationInput = sort === "supplier"
        ? { name: direction }
        : { [sort]: direction };
      const [total, rows] = await db.$transaction([
        db.supplyItem.count({ where }),
        db.supplyItem.findMany({ where, include: includeItem, orderBy: [orderBy, { id: direction }], skip: (page - 1) * pageSize, take: pageSize }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { total, items: rows.map(publicItem) };
    },
    async findSupplyItem(id, roomId) {
      const row = await db.supplyItem.findFirst({ where: { id, roomId }, include: includeItem });
      return row ? publicItem(row) : null;
    },
    async createSupplyItem(input, roomId) {
      return db.$transaction(async (tx) => {
        const value = await productAndSuppliers(tx, input, roomId);
        const row = await tx.supplyItem.create({ data: { ...data(input, value.product.id, value.product.name), roomId, openingBalance: input.openingBalance, currentQuantity: input.openingBalance,
          suppliers: { create: value.supplierIds.map((supplierId) => ({ supplierId })) } }, include: includeItem });
        return publicItem(row);
      });
    },
    async updateSupplyItem(id, input, roomId) {
      return db.$transaction(async (tx) => {
        const old = await tx.supplyItem.findFirst({ where: { id, roomId } });
        if (!old) return null;
        const value = await productAndSuppliers(tx, input, roomId);
        const nextOpening = new Prisma.Decimal(input.openingBalance);
        const delta = nextOpening.minus(old.openingBalance);
        if (delta.isNegative() && old.currentQuantity.lessThan(delta.abs())) throw new AccessError("VALIDATION_ERROR");
        const row = await tx.supplyItem.update({
          where: { id },
          data: {
            ...data(input, value.product.id, value.product.name),
            openingBalance: nextOpening,
            suppliers: { deleteMany: {}, create: value.supplierIds.map((supplierId) => ({ supplierId })) },
            ...(delta.isZero() ? {} : { currentQuantity: delta.isPositive() ? { increment: delta } : { decrement: delta.abs() } }),
          },
          include: includeItem,
        });
        if (old.productId !== value.product.id && !await tx.supplyItem.count({ where: { productId: old.productId } })) await tx.supplyProduct.delete({ where: { id: old.productId } });
        return publicItem(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },
    async deleteSupplyItem(id, roomId) {
      return db.$transaction(async (tx) => {
        const item = await tx.supplyItem.findFirst({ where: { id, roomId }, select: { id: true, productId: true } });
        if (!item) return false;
        await tx.supplyItem.delete({ where: { id } });
        if (!await tx.supplyItem.count({ where: { productId: item.productId } })) await tx.supplyProduct.delete({ where: { id: item.productId } });
        return true;
      });
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
    async searchProductOptions(q, roomId) {
      const products = await db.supplyProduct.findMany({ where: { roomId, ...(q ? { name: { contains: q, mode: "insensitive" } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 30 });
      return { products };
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
