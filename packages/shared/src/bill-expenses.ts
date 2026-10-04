import { z } from "zod";
import { currencySchema, rateDateSchema, type Currency } from "./currency.js";

export const billPaymentMethods = ["cash", "card", "cheque"] as const;
export const billExpenseSchema = z.object({
  categoryId: z.coerce.number().int().positive("fieldRequired"),
  amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "billExpenseAmountInvalid").refine((value) => Number(value) > 0, "billExpenseAmountInvalid").transform((value) => {
    const [whole, fraction = ""] = value.split("."); return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  }),
  currency: currencySchema,
  method: z.enum(billPaymentMethods),
  date: rateDateSchema,
  note: z.string().trim().max(4000, "fieldTooLong"),
}).strict();
export type BillExpenseInput = z.infer<typeof billExpenseSchema>;
export type BillExpense = BillExpenseInput & {
  id: string; categoryName: string; baseCurrency: Currency; baseAmount: string;
  lbpPerUsd: string | null; actorId: string; createdAt: string;
};
export const billExpenseSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  categoryId: z.coerce.number().int().positive().optional(),
  from: rateDateSchema.optional(), to: rateDateSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["date", "categoryName", "amount", "currency", "method", "createdAt"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine((value) => !value.from || !value.to || value.to >= value.from, { message: "billExpenseDateInvalid", path: ["to"] });
export type BillExpenseSearch = z.infer<typeof billExpenseSearchSchema>;
export type BillExpenseList = { expenses: BillExpense[]; total: number; baseCurrency: Currency; totalBaseAmount: string };
