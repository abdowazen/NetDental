import { z } from "zod";
import { clinicDate, rateDateSchema } from "./currency.js";

export const patientJobs = [
  "none",
  "student",
  "employee",
  "selfEmployed",
  "retired",
  "other",
] as const;
export function formatLebanesePhone(value: string): string | null {
  if (!/^[+\d\s().-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+")) {
    if (!digits.startsWith("961")) return null;
    digits = digits.slice(3);
  } else if (digits.startsWith("00961")) digits = digits.slice(5);
  else if (digits.startsWith("961") && digits.length >= 10) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[1-9]\d{6,7}$/.test(digits)) return null;
  const prefix = digits.slice(0, -6);
  return `+961 ${prefix} ${digits.slice(-6, -3)} ${digits.slice(-3)}`;
}
export const patientSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(1, "fieldRequired")
      .max(100, "fieldTooLong"),
    lastName: z
      .string()
      .trim()
      .min(1, "fieldRequired")
      .max(100, "fieldTooLong"),
    phone: z.string().trim().min(1, "fieldRequired").max(40, "fieldTooLong")
      .refine((value) => !value || formatLebanesePhone(value) !== null, "patientPhoneInvalid")
      .transform((value) => formatLebanesePhone(value) ?? value),
    gender: z.enum(["Male", "Female"], {
      errorMap: () => ({ message: "fieldRequired" }),
    }),
    fatherName: z.string().trim().max(100, "fieldTooLong").default(""),
    job: z.enum(patientJobs).default("none"),
    age: z
      .number()
      .int("ageInvalid")
      .min(0, "ageInvalid")
      .max(150, "ageInvalid")
      .default(0),
    firstVisit: rateDateSchema.default(() => clinicDate()),
    notes: z.string().trim().max(4000, "fieldTooLong").default(""),
  })
  .strict();
export type PatientInput = z.infer<typeof patientSchema>;
export type Patient = PatientInput & {
  id: number;
  fileId: string;
  fullName: string;
};
export type PatientList = { patients: Patient[]; nextCursor: number | null; total: number };
export const patientSearchSchema = z
  .object({
    q: z.string().trim().max(100).default(""),
    from: rateDateSchema.optional(),
    to: rateDateSchema.optional(),
    page: z.coerce.number().int().min(1).max(1000000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(["id", "fullName", "phone", "gender", "firstVisit"]).optional(),
    direction: z.enum(["asc", "desc"]).optional(),
    cursor: z.coerce.number().int().positive().max(2147483647).optional(),
  })
  .strict();
export type PatientSearch = z.infer<typeof patientSearchSchema>;
export const patientIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(2147483647);

export function patientPrefill(search: string): Partial<PatientInput> {
  const value = search.trim();
  if (!value) return {};
  if (/^[+\d\s().-]+$/.test(value) && /\d/.test(value))
    return { phone: value.slice(0, 40) };
  if (/^[\p{L}\p{M}\s.'’-]+$/u.test(value)) {
    const [firstName, ...rest] = value.split(/\s+/);
    return {
      firstName: firstName.slice(0, 100),
      lastName: rest.join(" ").slice(0, 100),
    };
  }
  return {};
}
