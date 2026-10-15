import { z } from "zod";
import { rateDateSchema } from "./currency.js";
import type { Patient } from "./patients.js";
import type { BillExpense } from "./bill-expenses.js";
import type { PurchaseInvoice } from "./purchase-invoices.js";

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

export const labStatementQuerySchema = z.object({
  laboratoryId: z.coerce.number().int().positive().optional(),
  status: z.enum(["all", "to_request", "requested", "received", "voided"]).default("all"),
  from: rateDateSchema,
  to: rateDateSchema,
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["requestDate", "laboratory", "patient", "procedure", "status", "cost"]).default("requestDate"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine((value) => value.to >= value.from, { message: "labDateInvalid", path: ["to"] });
export type LabStatementQuery = z.infer<typeof labStatementQuerySchema>;
export type LabStatementRow = {
  id: string; laboratoryId: number | null; laboratory: string; patientId: number; patientFileId: string; patientName: string;
  procedureCode: string; procedureName: string; teeth: number[]; requestDate: string; dueDate: string | null;
  receivedDate: string | null; status: "to_request" | "requested" | "received" | "voided"; cost: string; currency: "USD" | "LBP";
};
export type LabStatementReport = {
  total: number;
  rows: LabStatementRow[];
  payableTotals: { currency: "USD" | "LBP"; amount: string }[];
  paymentTotals: { currency: "USD" | "LBP"; amount: string }[];
  balanceTotals: { currency: "USD" | "LBP"; amount: string }[];
};

export const patientStatementQuerySchema = z.object({
  patientId: z.coerce.number().int().positive().optional(),
  activity: z.enum(["all", "charge", "payment"]).default("all"),
  treatmentType: z.enum(["all", "planned", "unplanned"]).default("all"),
  treatmentStatus: z.enum(["all", "completed"]).default("all"),
  from: rateDateSchema,
  to: rateDateSchema,
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["date", "patient", "description", "charge", "payment"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine((value) => value.to >= value.from, { message: "patientStatementDateInvalid", path: ["to"] });
export type PatientStatementQuery = z.infer<typeof patientStatementQuerySchema>;
export type PatientStatementRow = {
  id: string;
  type: "charge" | "payment";
  date: string;
  patientId: number;
  patientFileId: string;
  patientName: string;
  planNumber: number | null;
  entryKind: "procedure" | "discount" | "payment";
  description: string;
  originalAmount: string;
  originalCurrency: "USD" | "LBP";
  baseAmount: string;
  baseCurrency: "USD" | "LBP";
  method?: "cash" | "card";
};
export type PatientStatementReport = {
  total: number;
  rows: PatientStatementRow[];
  baseCurrency: "USD" | "LBP";
  openingBalance: string;
  periodCharges: string;
  periodPayments: string;
  closingBalance: string;
};

export const completedBalancesQuerySchema = z.object({
  period: z.enum(["monthly", "yearly", "custom"]).default("monthly"),
  from: rateDateSchema,
  to: rateDateSchema,
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["patientName", "phone", "completedCount", "completedCharges", "payments", "remaining"]).default("remaining"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().refine((value) => value.to >= value.from, { message: "completedBalancesDateInvalid", path: ["to"] });
export type CompletedBalancesQuery = z.infer<typeof completedBalancesQuerySchema>;
export type CompletedBalanceRow = {
  patientId: number;
  patientFileId: string;
  patientName: string;
  phone: string;
  completedCount: number;
  completedCharges: string;
  payments: string;
  remaining: string;
};
export type CompletedBalancesReport = {
  baseCurrency: "USD" | "LBP";
  from: string;
  to: string;
  total: number;
  rows: CompletedBalanceRow[];
  totals: {
    completedCount: number;
    completedCharges: string;
    payments: string;
    remaining: string;
  };
};

export const billingAnalyticsQuerySchema = z.object({
  period: z.enum(["monthly", "yearly", "custom"]).default("monthly"),
  from: rateDateSchema,
  to: rateDateSchema,
  compareFrom: rateDateSchema.optional(),
  compareTo: rateDateSchema.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  methods: z.string().regex(/^(?:cash|card|cheque)(?:,(?:cash|card|cheque))*$/).default("cash,card,cheque").transform((value) => [...new Set(value.split(","))] as ("cash" | "card" | "cheque")[]),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["date", "categoryName", "method", "baseAmount"]).default("date"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().superRefine((value, context) => {
  if (value.to < value.from) context.addIssue({ code: "custom", path: ["to"], message: "billingAnalyticsDateInvalid" });
  if (Boolean(value.compareFrom) !== Boolean(value.compareTo)) context.addIssue({ code: "custom", path: ["compareTo"], message: "billingAnalyticsComparisonInvalid" });
  if (value.compareFrom && value.compareTo && value.compareTo < value.compareFrom) context.addIssue({ code: "custom", path: ["compareTo"], message: "billingAnalyticsComparisonInvalid" });
});
export type BillingAnalyticsQuery = z.infer<typeof billingAnalyticsQuerySchema>;
export type BillingAnalyticsSummary = { total: string; count: number; average: string };
export type BillingAnalyticsReport = {
  baseCurrency: "USD" | "LBP";
  from: string;
  to: string;
  summary: BillingAnalyticsSummary;
  comparison: (BillingAnalyticsSummary & { from: string; to: string; changePercent: string | null }) | null;
  buckets: { key: string; current: string; comparison: string }[];
  categories: { categoryId: number; categoryName: string; total: string; count: number }[];
  categoryOptions: { id: number; name: string }[];
  methods: { method: "cash" | "card" | "cheque"; total: string; count: number }[];
  expenses: BillExpense[];
  total: number;
};

export const inventoryAnalyticsQuerySchema = z.object({
  period: z.enum(["monthly", "yearly", "custom"]).default("monthly"),
  from: rateDateSchema, to: rateDateSchema, compareFrom: rateDateSchema.optional(), compareTo: rateDateSchema.optional(),
  productId: z.coerce.number().int().positive().optional(), supplierId: z.coerce.number().int().positive().optional(),
  brand: z.string().trim().max(100).optional(),
  paymentTypes: z.string().regex(/^(?:cash|account)(?:,(?:cash|account))*$/).default("cash,account").transform((value) => [...new Set(value.split(","))] as ("cash" | "account")[]),
  page: z.coerce.number().int().min(1).max(1000000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(["date", "supplierName", "paymentType", "baseTotal", "invoiceNumber"]).default("date"), direction: z.enum(["asc", "desc"]).default("desc"),
}).strict().superRefine((value, context) => {
  if (value.to < value.from) context.addIssue({ code: "custom", path: ["to"], message: "inventoryAnalyticsDateInvalid" });
  if (Boolean(value.compareFrom) !== Boolean(value.compareTo) || (value.compareFrom && value.compareTo && value.compareTo < value.compareFrom)) context.addIssue({ code: "custom", path: ["compareTo"], message: "inventoryAnalyticsComparisonInvalid" });
});
export type InventoryAnalyticsQuery = z.infer<typeof inventoryAnalyticsQuerySchema>;
export type InventoryAnalyticsReport = {
  baseCurrency: "USD" | "LBP"; from: string; to: string;
  summary: BillingAnalyticsSummary; comparison: (BillingAnalyticsSummary & { from: string; to: string; changePercent: string | null }) | null;
  buckets: { key: string; current: string; comparison: string }[];
  suppliers: { supplierId: number; supplierName: string; total: string; count: number }[];
  products: { productId: number; productName: string; brands: string[]; total: string; quantity: string }[];
  stockProducts: { productId: number; productName: string; totalQuantity: string; variants: { itemId: number; brand: string; quantity: string; suppliers: string[] }[] }[];
  paymentTypes: { paymentType: "cash" | "account"; total: string; count: number }[];
  supplierOptions: { id: number; name: string }[]; productOptions: { id: number; name: string }[]; brandOptions: string[];
  invoices: PurchaseInvoice[]; total: number;
};
