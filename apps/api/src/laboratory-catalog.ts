import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  LaboratoryCatalog, LaboratoryCatalogInput, LaboratoryCatalogList, LaboratoryCatalogSearch,
  LaboratoryRate, LaboratoryRateInput,
} from "@clinic/shared";
import { AccessError } from "./access.js";

const laboratoryInclude = { _count: { select: { procedureRates: true } } } as const;
type LaboratoryRow = Prisma.LaboratoryGetPayload<{ include: typeof laboratoryInclude }>;
const publicLaboratory = (row: LaboratoryRow): LaboratoryCatalog => ({
  id: row.id, name: row.name, defaultCost: row.defaultCost.toFixed(2), turnaroundDays: row.turnaroundDays,
  material: row.material, shade: row.shade as LaboratoryCatalog["shade"], instructions: row.instructions,
  active: row.active, rateCount: row._count.procedureRates,
});
const rateInclude = { procedure: { select: { code: true, name: true } } } as const;
type RateRow = Prisma.LaboratoryProcedureRateGetPayload<{ include: typeof rateInclude }>;
const publicRate = (row: RateRow): LaboratoryRate => ({
  id: row.id, laboratoryId: row.laboratoryId, procedureId: row.procedureId,
  procedureCode: row.procedure.code, procedureName: row.procedure.name,
  cost: row.cost.toFixed(2), currency: row.currency, turnaroundDays: row.turnaroundDays, active: row.active,
});
export interface LaboratoryCatalogStore {
  searchLaboratories(input: LaboratoryCatalogSearch, roomId: number): Promise<LaboratoryCatalogList>;
  findLaboratory(id: number, roomId: number): Promise<LaboratoryCatalog | null>;
  createLaboratory(input: LaboratoryCatalogInput, roomId: number): Promise<LaboratoryCatalog>;
  updateLaboratory(id: number, input: LaboratoryCatalogInput, roomId: number): Promise<LaboratoryCatalog | null>;
  setLaboratoryActive(id: number, active: boolean, roomId: number): Promise<LaboratoryCatalog | null>;
  listLaboratoryRates(laboratoryId: number, roomId: number): Promise<LaboratoryRate[]>;
  createLaboratoryRate(laboratoryId: number, input: LaboratoryRateInput, roomId: number): Promise<LaboratoryRate>;
  updateLaboratoryRate(laboratoryId: number, rateId: number, input: LaboratoryRateInput, roomId: number): Promise<LaboratoryRate | null>;
  setLaboratoryRateActive(laboratoryId: number, rateId: number, active: boolean, roomId: number): Promise<LaboratoryRate | null>;
  deleteLaboratoryRate(laboratoryId: number, rateId: number, roomId: number): Promise<boolean>;
}
export function laboratoryCatalogStore(db: PrismaClient): LaboratoryCatalogStore {
  async function update(id: number, roomId: number, data: Prisma.LaboratoryUpdateInput) {
    try { return publicLaboratory(await db.laboratory.update({ where: { id, roomId }, data, include: laboratoryInclude })); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }
  async function validateRateScope(laboratoryId: number, procedureId: number, roomId: number) {
    const [laboratory, procedure] = await Promise.all([
      db.laboratory.findFirst({ where: { id: laboratoryId, roomId }, select: { id: true } }),
      db.procedure.findFirst({ where: { id: procedureId, roomId, requiresLab: true }, select: { id: true } }),
    ]);
    if (!laboratory || !procedure) throw new AccessError("NOT_FOUND");
  }
  return {
    async searchLaboratories({ q, page, pageSize, sort, direction, procedureId }, roomId) {
      const where: Prisma.LaboratoryWhereInput = { roomId,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
        ...(procedureId ? { active: true, procedureRates: { some: { procedureId, active: true, procedure: { active: true, requiresLab: true } } } } : {}),
      };
      const [total, rows] = await db.$transaction([
        db.laboratory.count({ where }),
        db.laboratory.findMany({ where, include: laboratoryInclude, orderBy: [{ [sort]: direction }, { id: direction }], take: pageSize, skip: (page - 1) * pageSize }),
      ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      return { total, laboratories: rows.map(publicLaboratory) };
    },
    async findLaboratory(id, roomId) {
      const row = await db.laboratory.findFirst({ where: { id, roomId }, include: laboratoryInclude });
      return row ? publicLaboratory(row) : null;
    },
    async createLaboratory(input, roomId) { return publicLaboratory(await db.laboratory.create({ data: { ...input, roomId }, include: laboratoryInclude })); },
    updateLaboratory: (id, input, roomId) => update(id, roomId, input),
    setLaboratoryActive: (id, active, roomId) => update(id, roomId, { active }),
    async listLaboratoryRates(laboratoryId, roomId) {
      if (!(await db.laboratory.findFirst({ where: { id: laboratoryId, roomId }, select: { id: true } }))) throw new AccessError("NOT_FOUND");
      return (await db.laboratoryProcedureRate.findMany({ where: { laboratoryId }, include: rateInclude, orderBy: [{ procedure: { name: "asc" } }, { id: "asc" }] })).map(publicRate);
    },
    async createLaboratoryRate(laboratoryId, input, roomId) {
      await validateRateScope(laboratoryId, input.procedureId, roomId);
      return publicRate(await db.laboratoryProcedureRate.create({ data: { laboratoryId, ...input }, include: rateInclude }));
    },
    async updateLaboratoryRate(laboratoryId, rateId, input, roomId) {
      await validateRateScope(laboratoryId, input.procedureId, roomId);
      const existing = await db.laboratoryProcedureRate.findFirst({ where: { id: rateId, laboratoryId, laboratory: { roomId } }, select: { id: true } });
      if (!existing) return null;
      return publicRate(await db.laboratoryProcedureRate.update({ where: { id: rateId }, data: input, include: rateInclude }));
    },
    async setLaboratoryRateActive(laboratoryId, rateId, active, roomId) {
      const existing = await db.laboratoryProcedureRate.findFirst({ where: { id: rateId, laboratoryId, laboratory: { roomId } }, select: { id: true } });
      if (!existing) return null;
      return publicRate(await db.laboratoryProcedureRate.update({ where: { id: rateId }, data: { active }, include: rateInclude }));
    },
    async deleteLaboratoryRate(laboratoryId, rateId, roomId) {
      const result = await db.laboratoryProcedureRate.deleteMany({ where: { id: rateId, laboratoryId, laboratory: { roomId } } });
      return result.count === 1;
    },
  };
}
