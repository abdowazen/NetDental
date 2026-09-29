import { z } from "zod";
import { rateDateSchema } from "./currency.js";
import type { Patient } from "./patients.js";

export const newPatientReportPeriodSchema = z.enum(["daily", "monthly", "yearly"]);
export type NewPatientReportPeriod = z.infer<typeof newPatientReportPeriodSchema>;

export const newPatientReportQuerySchema = z.object({
  period: newPatientReportPeriodSchema.default("monthly"),
  date: rateDateSchema,
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "fullName", "phone", "gender", "firstVisit", "createdAt"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export type NewPatientReportQuery = z.infer<typeof newPatientReportQuerySchema>;

export type NewPatientReportRow = Patient & { registeredAt: string };
export type NewPatientReport = {
  period: NewPatientReportPeriod;
  selectedDate: string;
  from: string;
  to: string;
  total: number;
  buckets: { key: string; count: number }[];
  patients: NewPatientReportRow[];
};
