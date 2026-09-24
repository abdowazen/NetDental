import { Prisma, type PrismaClient } from "@prisma/client";
import { formatLebanesePhone } from "@clinic/shared";
import type {
  Patient,
  PatientInput,
  PatientList,
  PatientSearch,
} from "@clinic/shared";

type Row = Omit<PatientInput, "firstVisit"> & {
  id: number;
  fullName: string;
  firstVisit: Date;
};
function publicPatient(
  row: Omit<Row, "firstVisit"> & { firstVisit: Date },
): Patient {
  return {
    id: row.id,
    fileId: String(row.id).padStart(6, "0"),
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    phone: row.phone,
    gender: row.gender,
    fatherName: row.fatherName,
    job: row.job,
    age: row.age,
    firstVisit: row.firstVisit.toISOString().slice(0, 10),
    notes: row.notes,
  };
}
export interface PatientStore {
  searchPatients(input: PatientSearch, roomId: number): Promise<PatientList>;
  findPatient(id: number, roomId: number): Promise<Patient | null>;
  createPatient(input: PatientInput, roomId: number): Promise<Patient>;
  updatePatient(
    id: number,
    input: PatientInput,
    roomId: number,
  ): Promise<Patient | null>;
  deletePatient(id: number, roomId: number): Promise<boolean>;
}
export function patientStore(db: PrismaClient): PatientStore {
  const data = (input: PatientInput) => ({
    ...input,
    fullName: `${input.firstName} ${input.lastName}`,
    firstVisit: new Date(`${input.firstVisit}T00:00:00Z`),
  });
  return {
    async searchPatients(
      {
        q,
        cursor,
        from,
        to,
        page = 1,
        pageSize = 30,
        sort = "id",
        direction = "desc",
      },
      roomId,
    ) {
      // Escape LIKE metacharacters: patient-entered text is always a literal substring.
      const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const digits = /^[+\d\s().-]+$/.test(q)
        ? (formatLebanesePhone(q) ?? q).replace(/\D/g, "")
        : "";
      const phoneMatch = digits
        ? Prisma.sql`regexp_replace("phone", '[^0-9]', '', 'g') LIKE ${`%${digits}%`}`
        : Prisma.sql`FALSE`;
      const filter = Prisma.sql`"roomId" = ${roomId} AND ${cursor ? Prisma.sql`"id" < ${cursor}` : Prisma.sql`TRUE`}
        AND ${from ? Prisma.sql`"firstVisit" >= ${from}::date` : Prisma.sql`TRUE`}
        AND ${to ? Prisma.sql`"firstVisit" <= ${to}::date` : Prisma.sql`TRUE`}
        AND ${q ? Prisma.sql`("fullName" ILIKE ${pattern} OR "phone" ILIKE ${pattern} OR "id"::text LIKE ${pattern} OR ${phoneMatch})` : Prisma.sql`TRUE`}`;
      const columns = {
        id: Prisma.sql`"id"`,
        fullName: Prisma.sql`lower("fullName")`,
        phone: Prisma.sql`"phone"`,
        gender: Prisma.sql`"gender"`,
        firstVisit: Prisma.sql`"firstVisit"`,
      };
      const order = direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const [counts, rows] = await db.$transaction([
        db.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM "Patient" WHERE ${filter}`,
        ),
        db.$queryRaw<
          (Omit<Row, "firstVisit"> & { firstVisit: Date })[]
        >(Prisma.sql`
        SELECT * FROM "Patient"
        WHERE ${filter}
        ORDER BY ${columns[sort]} ${order}, "id" ${order} LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
      `),
      ]);
      return {
        total: Number(counts[0].total),
        patients: rows.slice(0, pageSize).map(publicPatient),
        nextCursor: rows.length > pageSize ? rows[pageSize - 1].id : null,
      };
    },
    async findPatient(id, roomId) {
      const row = await db.patient.findFirst({ where: { id, roomId } });
      return row
        ? publicPatient(row as Parameters<typeof publicPatient>[0])
        : null;
    },
    async createPatient(input, roomId) {
      return publicPatient(
        (await db.patient.create({
          data: { ...data(input), roomId },
        })) as Parameters<typeof publicPatient>[0],
      );
    },
    async updatePatient(id, input, roomId) {
      try {
        return publicPatient(
          (await db.patient.update({
            where: { id, roomId },
            data: data(input),
          })) as Parameters<typeof publicPatient>[0],
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        )
          return null;
        throw error;
      }
    },
    async deletePatient(id, roomId) {
      return (await db.patient.deleteMany({ where: { id, roomId } })).count > 0;
    },
  };
}
