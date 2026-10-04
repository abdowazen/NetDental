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
export const labShades = [
  "A1", "A2", "A3", "A3.5", "A4",
  "B1", "B2", "B3", "B4",
  "C1", "C2", "C3", "C4",
  "BL1", "BL2", "BL3", "BL4",
] as const;
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
  labLaboratory: z.string().trim().max(150, "fieldTooLong").default(""),
  labDefaultCost: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "procedurePriceInvalid").default("0").transform((value) => {
    const [whole, fraction = ""] = value.split("."); return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  }),
  labTurnaroundDays: z.coerce.number().int().min(0).max(365).default(0),
  labMaterial: z.string().trim().max(100, "fieldTooLong").default(""),
  labShade: z.string().trim().max(40, "fieldTooLong").default(""),
  labInstructions: z.string().trim().max(2000, "fieldTooLong").default(""),
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
