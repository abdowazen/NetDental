import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { SystemLogPage, SystemLogSource } from "@clinic/shared";

export type NewSystemLog = {
  level: "error" | "warning";
  source: SystemLogSource;
  code: string;
  message: string;
  method?: string;
  path?: string;
  userId?: string | null;
};

export interface SystemLogStore {
  recordSystemLog?(input: NewSystemLog): Promise<void>;
  listSystemLogs?(input: { page: number; pageSize: number; source: "all" | SystemLogSource }): Promise<SystemLogPage>;
}

export function systemLogStore(db: PrismaClient): Required<SystemLogStore> {
  return {
    async recordSystemLog(input) {
      await db.$executeRaw(Prisma.sql`
        INSERT INTO "SystemLog" ("id", "level", "source", "code", "message", "method", "path", "userId")
        VALUES (${randomUUID()}::uuid, ${input.level}, ${input.source}, ${input.code}, ${input.message}, ${input.method ?? ""}, ${input.path ?? ""}, ${input.userId ?? null}::uuid)
      `);
    },
    async listSystemLogs(input) {
      const where = input.source === "all" ? Prisma.empty : Prisma.sql`WHERE "source" = ${input.source}`;
      const offset = (input.page - 1) * input.pageSize;
      type Row = { id: string; level: string; source: string; code: string; message: string; method: string; path: string; userId: string | null; createdAt: Date };
      const [counts, rows] = await db.$transaction([
        db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "SystemLog" ${where}`),
        db.$queryRaw<Row[]>(Prisma.sql`SELECT "id", "level", "source", "code", "message", "method", "path", "userId", "createdAt" FROM "SystemLog" ${where} ORDER BY "createdAt" DESC, "id" DESC LIMIT ${input.pageSize} OFFSET ${offset}`),
      ]);
      return {
        total: Number(counts[0]?.total ?? 0),
        logs: rows.map((row) => ({
          ...row,
          level: row.level as "error" | "warning",
          source: row.source as SystemLogSource,
          createdAt: row.createdAt.toISOString(),
        })),
      };
    },
  };
}
