import { Prisma, type PrismaClient } from "@prisma/client";
import type { NewPatientReport, NewPatientReportQuery, Patient } from "@clinic/shared";

type PatientRow = {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  gender: string;
  fatherName: string;
  job: string;
  age: number;
  firstVisit: Date;
  notes: string;
  createdAt: Date;
};

const dateText = (value: Date) => value.toISOString().slice(0, 10);
function addDays(value: string, days: number) {
  const result = new Date(`${value}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return dateText(result);
}
function bounds(period: NewPatientReportQuery["period"], selected: string) {
  const year = Number(selected.slice(0, 4));
  const month = Number(selected.slice(5, 7));
  if (period === "daily") return { start: selected, end: addDays(selected, 1) };
  if (period === "monthly") {
    const start = `${selected.slice(0, 7)}-01`;
    return { start, end: dateText(new Date(Date.UTC(year, month, 1))) };
  }
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}
function publicPatient(row: PatientRow): Patient & { registeredAt: string } {
  return {
    id: row.id,
    fileId: String(row.id).padStart(6, "0"),
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    phone: row.phone,
    gender: row.gender as Patient["gender"],
    fatherName: row.fatherName,
    job: row.job as Patient["job"],
    age: row.age,
    firstVisit: dateText(row.firstVisit),
    notes: row.notes,
    registeredAt: row.createdAt.toISOString(),
  };
}

export interface ReportStore {
  getNewPatientsReport(input: NewPatientReportQuery, roomId: number): Promise<NewPatientReport>;
}

export function reportStore(db: PrismaClient): ReportStore {
  return {
    async getNewPatientsReport(input, roomId) {
      const { start, end } = bounds(input.period, input.date);
      const localCreated = Prisma.sql`("createdAt" AT TIME ZONE 'Asia/Beirut')`;
      const filter = Prisma.sql`"roomId" = ${roomId} AND ${localCreated} >= ${start}::timestamp AND ${localCreated} < ${end}::timestamp`;
      const columns = {
        id: Prisma.sql`"id"`,
        fullName: Prisma.sql`lower("fullName")`,
        phone: Prisma.sql`"phone"`,
        gender: Prisma.sql`"gender"`,
        firstVisit: Prisma.sql`"firstVisit"`,
        createdAt: Prisma.sql`"createdAt"`,
      };
      const order = input.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
      const bucketExpression = input.period === "daily"
        ? Prisma.sql`EXTRACT(HOUR FROM ${localCreated})::int`
        : input.period === "monthly"
          ? Prisma.sql`EXTRACT(DAY FROM ${localCreated})::int`
          : Prisma.sql`EXTRACT(MONTH FROM ${localCreated})::int`;
      const [counts, grouped, rows] = await db.$transaction([
        db.$queryRaw<{ total: bigint }[]>(Prisma.sql`SELECT count(*) AS total FROM "Patient" WHERE ${filter}`),
        db.$queryRaw<{ bucket: number; count: bigint }[]>(Prisma.sql`SELECT ${bucketExpression} AS bucket, count(*) AS count FROM "Patient" WHERE ${filter} GROUP BY bucket ORDER BY bucket`),
        db.$queryRaw<PatientRow[]>(Prisma.sql`SELECT "id", "firstName", "lastName", "fullName", "phone", "gender", "fatherName", "job", "age", "firstVisit", "notes", "createdAt" FROM "Patient" WHERE ${filter} ORDER BY ${columns[input.sort]} ${order}, "id" ${order} LIMIT ${input.pageSize} OFFSET ${(input.page - 1) * input.pageSize}`),
      ]);
      const countsByBucket = new Map(grouped.map((row) => [Number(row.bucket), Number(row.count)]));
      const bucketCount = input.period === "daily" ? 24 : input.period === "monthly" ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 0)).getUTCDate() : 12;
      const buckets = Array.from({ length: bucketCount }, (_, index) => ({
        key: input.period === "daily" ? `${String(index).padStart(2, "0")}:00` : String(index + 1).padStart(2, "0"),
        count: countsByBucket.get(input.period === "daily" ? index : index + 1) ?? 0,
      }));
      return {
        period: input.period,
        selectedDate: input.date,
        from: start,
        to: addDays(end, -1),
        total: Number(counts[0]?.total ?? 0),
        buckets,
        patients: rows.map(publicPatient),
      };
    },
  };
}
