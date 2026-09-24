import { z } from "zod";

export const procedureCategories = [
  "consultation_diagnosis", "prevention_hygiene", "restorative_dentistry",
  "endodontics", "periodontics", "oral_surgery", "fixed_prosthodontics",
  "removable_prosthodontics", "implantology", "orthodontics",
  "cosmetic_dentistry", "imaging", "other",
] as const;
export const procedureDentitions = ["permanent", "primary", "both"] as const;
export const procedureScopes = ["single_tooth", "tooth_surfaces", "multiple_teeth", "whole_mouth"] as const;
// Expand this registry when additional odontogram renderers are implemented.
export const chartIndicators = ["generic"] as const;
export const procedureSchema = z.object({
  code: z.string().trim().min(1, "fieldRequired").max(40, "fieldTooLong").transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1, "fieldRequired").max(150, "fieldTooLong"),
  category: z.enum(procedureCategories),
  description: z.string().trim().max(4000, "fieldTooLong"),
  defaultPrice: z.string().trim().min(1, "fieldRequired")
    .regex(/^\d{1,10}(\.\d{1,2})?$/, "procedurePriceInvalid")
    .transform((value) => {
      const [whole, fraction = ""] = value.split(".");
      return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
    }),
  dentition: z.enum(procedureDentitions),
  scope: z.enum(procedureScopes),
  requiresLab: z.boolean(),
  chartIndicator: z.enum(chartIndicators),
  active: z.boolean(),
}).strict();
export type ProcedureInput = z.infer<typeof procedureSchema>;
export type Procedure = ProcedureInput & { id: number };
export const procedureSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "code", "name", "category", "defaultPrice", "active"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export const procedureStatusSchema = z.object({ active: z.boolean() }).strict();
export type ProcedureSearch = z.infer<typeof procedureSearchSchema>;
export type ProcedureList = { procedures: Procedure[]; total: number };
