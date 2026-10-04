import { Prisma, type BillCategory as Row, type PrismaClient } from "@prisma/client";
import type { BillCategory, BillCategoryInput, BillCategoryList, BillCategorySearch } from "@clinic/shared";

function publicCategory(row: Row): BillCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    defaultAmount: row.defaultAmount?.toFixed(2) ?? null,
    currency: row.currency,
    active: row.active,
  };
}

export interface BillCategoryStore {
  searchBillCategories(input: BillCategorySearch, roomId: number): Promise<BillCategoryList>;
  findBillCategory(id: number, roomId: number): Promise<BillCategory | null>;
  createBillCategory(input: BillCategoryInput, roomId: number): Promise<BillCategory>;
  updateBillCategory(id: number, input: BillCategoryInput, roomId: number): Promise<BillCategory | null>;
  setBillCategoryActive(id: number, active: boolean, roomId: number): Promise<BillCategory | null>;
}

export function billCategoryStore(db: PrismaClient): BillCategoryStore {
  async function update(id: number, roomId: number, data: Prisma.BillCategoryUpdateInput) {
    try {
      return publicCategory(await db.billCategory.update({ where: { id, roomId }, data }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }
  const data = (input: BillCategoryInput) => ({
    name: input.name, description: input.description,
    defaultAmount: input.defaultAmount || null, currency: input.currency, active: input.active,
  });
  return {
    async searchBillCategories({ q, page, pageSize, sort, direction }, roomId) {
      const text = q.replace(/[%_]/g, "\\$&");
      const where: Prisma.BillCategoryWhereInput = { roomId, ...(q ? { OR: [
        { name: { contains: text, mode: "insensitive" } },
        { description: { contains: text, mode: "insensitive" } },
      ] } : {}) };
      const [total, rows] = await db.$transaction([
        db.billCategory.count({ where }),
        db.billCategory.findMany({ where, orderBy: [{ [sort]: direction }, { id: direction }], skip: (page - 1) * pageSize, take: pageSize }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { total, categories: rows.map(publicCategory) };
    },
    async findBillCategory(id, roomId) {
      const row = await db.billCategory.findFirst({ where: { id, roomId } });
      return row ? publicCategory(row) : null;
    },
    async createBillCategory(input, roomId) {
      return publicCategory(await db.billCategory.create({ data: { ...data(input), roomId } }));
    },
    updateBillCategory: (id, input, roomId) => update(id, roomId, data(input)),
    setBillCategoryActive: (id, active, roomId) => update(id, roomId, { active }),
  };
}
