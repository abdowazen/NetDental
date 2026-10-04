import { z } from "zod";
import { labShades } from "./procedures.js";

const money = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "procedurePriceInvalid").transform((value) => {
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
});
export const laboratoryCatalogSchema = z.object({
  name: z.string().trim().min(1, "fieldRequired").max(150, "fieldTooLong"),
  defaultCost: money.default("0"),
  turnaroundDays: z.coerce.number().int().min(0).max(365).default(0),
  material: z.string().trim().max(100, "fieldTooLong").default(""),
  shade: z.union([z.enum(labShades), z.literal("")]).default(""),
  instructions: z.string().trim().max(2000, "fieldTooLong").default(""),
  active: z.boolean().default(true),
}).strict();
export const laboratoryCatalogSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "name", "defaultCost", "turnaroundDays", "active"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  procedureId: z.coerce.number().int().positive().optional(),
}).strict();
export const laboratoryCatalogStatusSchema = z.object({ active: z.boolean() }).strict();
export const laboratoryRateSchema = z.object({
  procedureId: z.coerce.number().int().positive(),
  cost: money,
  currency: z.enum(["USD", "LBP"]),
  turnaroundDays: z.coerce.number().int().min(0).max(365),
  active: z.boolean().default(true),
}).strict();
export type LaboratoryCatalogInput = z.infer<typeof laboratoryCatalogSchema>;
export type LaboratoryCatalogSearch = z.infer<typeof laboratoryCatalogSearchSchema>;
export type LaboratoryCatalog = LaboratoryCatalogInput & { id: number; rateCount: number };
export type LaboratoryCatalogList = { laboratories: LaboratoryCatalog[]; total: number };
export type LaboratoryRateInput = z.infer<typeof laboratoryRateSchema>;
export type LaboratoryRate = LaboratoryRateInput & { id: number; laboratoryId: number; procedureCode: string; procedureName: string };
