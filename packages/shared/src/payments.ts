import { z } from "zod";
import { currencySchema, rateDateSchema, type Currency } from "./currency.js";

export const paymentMethods = ["cash", "card"] as const;
export const paymentAmountSchema = z.string().trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "paymentAmountInvalid")
  .refine((value) => Number(value) > 0, "paymentAmountInvalid")
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
  });
export const paymentInputSchema = z.object({
  amount: paymentAmountSchema,
  method: z.enum(paymentMethods),
  date: rateDateSchema,
  currency: currencySchema,
  note: z.string().trim().max(4000),
}).strict();
export type PaymentInput = z.infer<typeof paymentInputSchema>;
export type Payment = PaymentInput & {
  id: string;
  baseCurrency: Currency;
  baseAmount: string;
  lbpPerUsd: string | null;
  actorId: string;
  recordedAt: string;
};
export type LedgerEntry = {
  id: string; type: "charge" | "payment"; date: string; description: string;
  originalAmount: string; originalCurrency: Currency;
  baseAmount: string; baseCurrency: Currency; method?: PaymentInput["method"];
};
export type PaymentSummary = {
  baseCurrency: Currency;
  effectiveRate: { date: string; lbpPerUsd: string } | null;
  planEstimate: string;
  discountAmount: string;
  discountPercent: string;
  patientCharge: string;
  paymentReceived: string;
  patientBalance: string;
  payments: Payment[];
  ledger: LedgerEntry[];
};
