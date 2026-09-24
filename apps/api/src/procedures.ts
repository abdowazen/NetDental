import { Prisma, type PrismaClient, type Procedure as Row } from "@prisma/client";
import type { Procedure, ProcedureInput, ProcedureList, ProcedureSearch } from "@clinic/shared";

function publicProcedure(row: Row): Procedure {
  return {
    id: row.id, code: row.code, name: row.name,
    category: row.category as Procedure["category"],
    description: row.description, defaultPrice: row.defaultPrice.toFixed(2),
    dentition: row.dentition as Procedure["dentition"],
    scope: row.scope as Procedure["scope"],
    requiresLab: row.requiresLab,
    chartIndicator: row.chartIndicator as Procedure["chartIndicator"],
    active: row.active,
  };
}
export interface ProcedureStore {
  searchProcedures(input: ProcedureSearch, roomId: number): Promise<ProcedureList>;
  findProcedure(id: number, roomId: number): Promise<Procedure | null>;
  createProcedure(input: ProcedureInput, roomId: number): Promise<Procedure>;
  updateProcedure(id: number, input: ProcedureInput, roomId: number): Promise<Procedure | null>;
  setProcedureActive(id: number, active: boolean, roomId: number): Promise<Procedure | null>;
}
export function procedureStore(db: PrismaClient): ProcedureStore {
  async function update(id: number, roomId: number, data: Prisma.ProcedureUpdateInput) {
    try {
      return publicProcedure(await db.procedure.update({ where: { id, roomId }, data }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }
  return {
    async searchProcedures({ q, page, pageSize, sort, direction }, roomId) {
      const text = q.replace(/[\\%_]/g, "\\$&");
      const where: Prisma.ProcedureWhereInput = {
        roomId,
        ...(q ? { OR: [
          { code: { contains: text, mode: "insensitive" as const } },
          { name: { contains: text, mode: "insensitive" as const } },
        ] } : {}),
      };
      const [total, rows] = await db.$transaction([
        db.procedure.count({ where }),
        db.procedure.findMany({ where, orderBy: [{ [sort]: direction }, { id: direction }],
          take: pageSize, skip: (page - 1) * pageSize }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { total, procedures: rows.map(publicProcedure) };
    },
    async findProcedure(id, roomId) {
      const row = await db.procedure.findFirst({ where: { id, roomId } });
      return row ? publicProcedure(row) : null;
    },
    async createProcedure(input, roomId) {
      return publicProcedure(await db.procedure.create({ data: { ...input, roomId } }));
    },
    updateProcedure: (id, input, roomId) => update(id, roomId, input),
    setProcedureActive: (id, active, roomId) => update(id, roomId, { active }),
  };
}
