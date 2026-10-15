import { z } from "zod";
import { clinicDate, currencySchema, rateDateSchema, type Currency } from "./currency.js";
import { formatLebanesePhone } from "./patients.js";

const quantitySchema = z.string().trim().regex(/^\d{1,12}(\.\d{1,3})?$/, "supplyQuantityInvalid").transform((value) => {
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(3, "0")}`;
});
const optionalOpeningBalanceSchema = z.union([z.literal(""), quantitySchema]).default("").transform((value) => value || "0.000");
const priceSchema = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "supplyPriceInvalid").transform((value) => {
  const [whole, fraction = ""] = value.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
});
const optionalDateSchema = z.union([z.literal(""), rateDateSchema]);

export const supplyItemSchema = z.object({
  name: z.string().trim().min(1, "fieldRequired").max(150, "fieldTooLong"),
  brand: z.string().trim().min(1, "fieldRequired").max(100, "fieldTooLong"),
  supplierIds: z.array(z.number().int().positive()).max(100).default([]).transform((value) => [...new Set(value)]),
  openingBalance: optionalOpeningBalanceSchema,
  defaultPrice: priceSchema,
  currency: currencySchema,
  date: rateDateSchema.default(() => clinicDate()),
  expiryDate: optionalDateSchema,
}).strict().refine((value) => !value.expiryDate || value.expiryDate >= value.date, {
  path: ["expiryDate"], message: "supplyExpiryBeforeDate",
});
export type SupplyItemInput = z.infer<typeof supplyItemSchema>;
export type SupplyItem = SupplyItemInput & {
  id: number;
  productId: number;
  supplierNames: string[];
  currency: Currency;
  currentQuantity: string;
};

export const supplyItemSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "name", "brand", "supplier", "openingBalance", "defaultPrice", "currentQuantity", "date", "expiryDate"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export type SupplyItemSearch = z.infer<typeof supplyItemSearchSchema>;
export type SupplyItemList = { items: SupplyItem[]; total: number };

export const inventoryOptionSearchSchema = z.object({ q: z.string().trim().max(100).default("") }).strict();
export type SupplierOption = { id: number; name: string };
export type SupplierOptionList = { suppliers: SupplierOption[] };
export type BrandOptionList = { brands: string[] };
export type ProductOptionList = { products: { id: number; name: string }[] };

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "fieldRequired").max(150, "fieldTooLong"),
  phone: z.string().trim().max(40, "fieldTooLong")
    .refine((value) => !value || formatLebanesePhone(value) !== null, "supplierPhoneInvalid")
    .transform((value) => value ? formatLebanesePhone(value) ?? value : ""),
  address: z.string().trim().max(500, "fieldTooLong"),
  active: z.boolean(),
}).strict();
export type SupplierInput = z.infer<typeof supplierSchema>;
export type Supplier = SupplierInput & { id: number; assignedItems: number };
export const supplierSearchSchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["id", "name", "phone", "address", "active"]).default("id"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict();
export const supplierStatusSchema = z.object({ active: z.boolean() }).strict();
export type SupplierSearch = z.infer<typeof supplierSearchSchema>;
export type SupplierList = { suppliers: Supplier[]; total: number };
