import { z } from "zod";
import { currencySchema, rateDateSchema, type Currency, type ExchangeRate } from "./currency.js";

const price = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "purchasePriceInvalid").refine((value) => Number(value) > 0, "purchasePriceInvalid").transform((value) => {
  const [whole, fraction = ""] = value.split("."); return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
});
const quantity = z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, "purchaseQuantityInvalid").refine((value) => Number(value) > 0, "purchaseQuantityInvalid").transform((value) => {
  const [whole, fraction = ""] = value.split("."); return `${BigInt(whole)}.${fraction.padEnd(3, "0")}`;
});
export const purchaseInvoiceLineSchema = z.object({
  itemId: z.coerce.number().int().positive("fieldRequired"), purchasePrice: price, quantity,
  expiryDate: z.union([z.literal(""), rateDateSchema]), description: z.string().trim().max(500, "fieldTooLong").default(""),
}).strict();
export const purchaseInvoiceSchema = z.object({
  supplierId: z.coerce.number().int().positive("fieldRequired"), paymentType: z.enum(["cash", "account"]),
  currency: currencySchema, date: rateDateSchema, note: z.string().trim().max(4000, "fieldTooLong"),
  lines: z.array(purchaseInvoiceLineSchema).min(1, "purchaseLineRequired").max(100, "purchaseTooManyLines"),
}).strict().superRefine((value, context) => {
  const seen = new Set<number>();
  value.lines.forEach((line, index) => {
    if (seen.has(line.itemId)) context.addIssue({ code: "custom", path: ["lines", index, "itemId"], message: "purchaseDuplicateProduct" });
    seen.add(line.itemId);
    if (line.expiryDate && line.expiryDate < value.date) context.addIssue({ code: "custom", path: ["lines", index, "expiryDate"], message: "purchaseExpiryBeforeDate" });
  });
});
export type PurchaseInvoiceInput = z.infer<typeof purchaseInvoiceSchema>;
export type PurchaseInvoiceLine = PurchaseInvoiceInput["lines"][number] & {
  id: number; itemName: string; brand: string; defaultPrice: string; lineTotal: string;
};
export type PurchaseInvoice = Omit<PurchaseInvoiceInput, "lines"> & {
  id: number; invoiceNumber: string; supplierName: string; totalAmount: string; baseCurrency: Currency;
  baseTotal: string; lbpPerUsd: string | null; actorId: string; createdAt: string; lines: PurchaseInvoiceLine[];
};
export const purchaseInvoiceSearchSchema = z.object({
  q: z.string().trim().max(100).default(""), supplierId: z.coerce.number().int().positive().optional(),
  paymentType: z.enum(["cash", "account"]).optional(), from: rateDateSchema.optional(), to: rateDateSchema.optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "date", "supplierName", "paymentType", "totalAmount", "currency", "createdAt"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine((value) => !value.from || !value.to || value.to >= value.from, { path: ["to"], message: "billExpenseDateInvalid" });
export type PurchaseInvoiceSearch = z.infer<typeof purchaseInvoiceSearchSchema>;
export type PurchaseInvoiceList = { invoices: PurchaseInvoice[]; total: number; baseCurrency: Currency; totalBaseAmount: string };
export type PurchaseProductOption = { id: number; name: string; brand: string; defaultPrice: string; currency: Currency; expiryDate: string; currentQuantity: string };
export type PurchaseProductOptionList = { products: PurchaseProductOption[]; effectiveRate: ExchangeRate | null };
