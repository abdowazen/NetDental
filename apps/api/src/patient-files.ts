import type { PrismaClient } from "@prisma/client";
import type { PatientFile, PatientFileMetadataInput } from "@clinic/shared";
import { AccessError } from "./access.js";

type StoredPatientFile = PatientFile & { storedName: string };
const day = (value: Date) => value.toISOString().slice(0, 10);
const map = (row: { id: string; patientId: number; originalName: string; kind: string; mimeType: string; size: number; tooth: number | null; date: Date; description: string; createdAt: Date }) => ({
  id: row.id, patientId: row.patientId, originalName: row.originalName,
  kind: row.kind as PatientFile["kind"], mimeType: row.mimeType as PatientFile["mimeType"],
  size: row.size, tooth: row.tooth, date: day(row.date), description: row.description,
  uploadedAt: row.createdAt.toISOString(),
});

export interface PatientFileStore {
  listPatientFiles(patientId: number, roomId: number): Promise<PatientFile[]>;
  createPatientFile(patientId: number, roomId: number, actorId: string, storedName: string, size: number, input: PatientFileMetadataInput): Promise<PatientFile>;
  getPatientFile(patientId: number, roomId: number, id: string): Promise<StoredPatientFile>;
  deletePatientFile(patientId: number, roomId: number, id: string): Promise<string>;
}

export function patientFileStore(db: PrismaClient): PatientFileStore {
  async function patient(patientId: number, roomId: number) {
    if (!(await db.patient.findFirst({ where: { id: patientId, roomId }, select: { id: true } }))) throw new AccessError("NOT_FOUND");
  }
  return {
    async listPatientFiles(patientId, roomId) {
      await patient(patientId, roomId);
      return (await db.patientFile.findMany({ where: { patientId, roomId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] })).map(map);
    },
    async createPatientFile(patientId, roomId, actorId, storedName, size, input) {
      await patient(patientId, roomId);
      return map(await db.patientFile.create({ data: {
        patientId, roomId, uploadedById: actorId, storedName, size,
        originalName: input.originalName, kind: input.kind, mimeType: input.mimeType,
        tooth: input.tooth, date: new Date(`${input.date}T00:00:00Z`), description: input.description,
      } }));
    },
    async getPatientFile(patientId, roomId, id) {
      const row = await db.patientFile.findFirst({ where: { id, patientId, roomId } });
      if (!row) throw new AccessError("NOT_FOUND");
      return { ...map(row), storedName: row.storedName };
    },
    async deletePatientFile(patientId, roomId, id) {
      return db.$transaction(async (tx) => {
        const row = await tx.patientFile.findFirst({ where: { id, patientId, roomId }, select: { storedName: true } });
        if (!row) throw new AccessError("NOT_FOUND");
        await tx.patientFile.delete({ where: { id } });
        return row.storedName;
      });
    },
  };
}
