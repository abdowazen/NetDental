import { z } from "zod";
import { currencySchema, type Currency } from "./currency.js";

const optionalAmountSchema = z.string().trim().refine(
  (value) => value === "" || /^\d{1,12}(\.\d{1,2})?$/.test(value),
  "billCategoryAmountInvalid",
).transform((value) => {
  if (!value) return "";
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
});

export const billCategorySchema = z.object({
  name: z.string().trim().min(1, "fieldRequired").max(150, "fieldTooLong"),
  description: z.string().trim().max(2000, "fieldTooLong"),
  defaultAmount: optionalAmountSchema,
  currency: currencySchema,
  active: z.boolean(),
}).strict();
export type BillCategoryInput = z.infer<typeof billCategorySchema>;
export type BillCategory = Omit<BillCategoryInput, "defaultAmount"> & { id: number; defaultAmount: string | null; currency: Currency };

export const billCategorySearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "name", "defaultAmount", "currency", "active"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export const billCategoryStatusSchema = z.object({ active: z.boolean() }).strict();
export type BillCategorySearch = z.infer<typeof billCategorySearchSchema>;
export type BillCategoryList = { categories: BillCategory[]; total: number };
