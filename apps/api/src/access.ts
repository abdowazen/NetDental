import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  Access,
  Clinic,
  ManagedUser,
  ManagedUserInput,
  Screen,
} from "@clinic/shared";

export class AccessError extends Error {
  constructor(public code: "CONFLICT" | "NOT_FOUND" | "VALIDATION_ERROR") {
    super(code);
  }
}
export interface AccessStore {
  accessFor(userId: string, role: string): Promise<Access>;
  listManagedUsers(): Promise<ManagedUser[]>;
  saveManagedUser(
    id: string | null,
    input: ManagedUserInput,
    passwordHash?: string,
  ): Promise<string>;
  listClinics(): Promise<Clinic[]>;
  saveClinic(id: number | null, name: string): Promise<void>;
  saveRoom(id: number | null, clinicId: number, name: string): Promise<void>;
}
export function accessStore(db: PrismaClient): AccessStore {
  return {
    async accessFor(userId, role) {
      const [permissions, rooms] = await Promise.all([
        db.screenPermission.findMany({ where: { userId } }),
        db.surgicalRoom.findMany({
          where: role === "ADMIN" ? {} : { assignments: { some: { userId } } },
          include: { clinic: true },
          orderBy: [{ clinicId: "asc" }, { name: "asc" }],
        }),
      ]);
      return {
        permissions: permissions.map(
          ({ screen, view, create, modify, delete: remove }) => ({
            screen: screen as Screen,
            view,
            create,
            modify,
            delete: remove,
          }),
        ),
        rooms: rooms.map((r) => ({
          id: r.id,
          name: r.name,
          clinicId: r.clinicId,
          clinicName: r.clinic.name,
        })),
      };
    },
    async listManagedUsers() {
      const users = await db.user.findMany({
        select: {
          id: true,
          username: true,
          displayName: true,
          role: true,
          isActive: true,
          assignments: true,
          permissions: true,
        },
        orderBy: { username: "asc" },
      });
      return users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        isActive: u.isActive,
        roomIds: u.assignments.map((a) => a.roomId),
        permissions: u.permissions.map(
          ({ screen, view, create, modify, delete: remove }) => ({
            screen: screen as Screen,
            view,
            create,
            modify,
            delete: remove,
          }),
        ),
      }));
    },
    async saveManagedUser(id, input, passwordHash) {
      return db.$transaction(async (tx) => {
        // Serialize administrator changes to prevent concurrent last-admin removal.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(730019)`;
        const existing = id
          ? await tx.user.findUnique({ where: { id } })
          : null;
        if (id && !existing) throw new AccessError("NOT_FOUND");
        if (!id && !passwordHash) throw new AccessError("VALIDATION_ERROR");
        if (
          existing?.role === "ADMIN" &&
          existing.isActive &&
          (input.role !== "ADMIN" || !input.isActive) &&
          (await tx.user.count({ where: { role: "ADMIN", isActive: true } })) <=
            1
        )
          throw new AccessError("CONFLICT");
        if (
          (await tx.surgicalRoom.count({
            where: { id: { in: input.roomIds } },
          })) !== input.roomIds.length
        )
          throw new AccessError("VALIDATION_ERROR");
        const data = {
          username: input.username,
          displayName: input.displayName,
          role: input.role,
          isActive: input.isActive,
          ...(passwordHash ? { passwordHash } : {}),
        };
        const user = id
          ? await tx.user.update({ where: { id }, data })
          : await tx.user.create({
              data: { ...data, passwordHash: passwordHash! },
            });
        await tx.roomAssignment.deleteMany({ where: { userId: user.id } });
        await tx.screenPermission.deleteMany({ where: { userId: user.id } });
        if (input.roomIds.length)
          await tx.roomAssignment.createMany({
            data: input.roomIds.map((roomId) => ({ userId: user.id, roomId })),
          });
        if (input.permissions.length)
          await tx.screenPermission.createMany({
            data: input.permissions.map((p) => ({ ...p, userId: user.id })),
          });
        if (passwordHash || !input.isActive)
          await tx.session.deleteMany({ where: { userId: user.id } });
        return user.id;
      });
    },
    listClinics: () =>
      db.clinic.findMany({
        include: { rooms: { orderBy: { name: "asc" } } },
        orderBy: { name: "asc" },
      }),
    async saveClinic(id, name) {
      if (id) await db.clinic.update({ where: { id }, data: { name } });
      else await db.clinic.create({ data: { name } });
    },
    async saveRoom(id, clinicId, name) {
      if (id) {
        const result = await db.surgicalRoom.updateMany({
          where: { id, clinicId },
          data: { name },
        });
        if (!result.count) throw new AccessError("NOT_FOUND");
      } else await db.surgicalRoom.create({ data: { name, clinicId } });
    },
  };
}
export function databaseAccessError(error: unknown) {
  if (error instanceof AccessError) return error.code;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "CONFLICT";
    if (error.code === "P2025") return "NOT_FOUND";
    if (error.code === "P2003") return "VALIDATION_ERROR";
  }
  return null;
}
