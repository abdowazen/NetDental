import { z } from "zod";
import { rateDateSchema } from "./currency.js";
import type { Currency, ExchangeRate } from "./currency.js";
import { procedureSchema } from "./procedures.js";

export const dentitions = ["adult", "pediatric", "mixed"] as const;
export type Dentition = typeof dentitions[number];
export const permanentTeeth = [1, 2, 3, 4].flatMap((q) => Array.from({ length: 8 }, (_, i) => q * 10 + i + 1));
export const primaryTeeth = [5, 6, 7, 8].flatMap((q) => Array.from({ length: 5 }, (_, i) => q * 10 + i + 1));
export const allTeeth = [...permanentTeeth, ...primaryTeeth];
export const toothIdSchema = z.number().int().refine((id) => allTeeth.includes(id), "odInvalidTooth");
export function toothInfo(id: number) {
  const quadrant = Math.floor(id / 10);
  const position = id % 10;
  const primary = quadrant >= 5;
  const upper = [1, 2, 5, 6].includes(quadrant);
  const right = [1, 4, 5, 8].includes(quadrant);
  const kind = position <= 2 ? "incisor" : position === 3 ? "canine" : !primary && position <= 5 ? "premolar" : "molar";
  return { quadrant, position, primary, upper, right, kind } as const;
}
export const surfaces = ["mesial", "distal", "buccal", "lingual", "occlusal", "incisal"] as const;
export type Surface = typeof surfaces[number];
export function validSurfaces(id: number): Surface[] {
  return ["mesial", "distal", "buccal", "lingual", id % 10 <= 3 ? "incisal" : "occlusal"];
}
export function surfaceLabel(id: number, surface: Surface) {
  if (surface === "buccal" && id % 10 <= 3) return "facial";
  if (surface === "lingual" && toothInfo(id).upper) return "palatal";
  return surface;
}
export const toothAssociationSchema = z.object({
  tooth: toothIdSchema,
  surfaces: z.array(z.enum(surfaces)).max(5),
  role: z.enum(["target", "abutment", "pontic"]),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.surfaces).size !== value.surfaces.length || value.surfaces.some((s) => !validSurfaces(value.tooth).includes(s)))
    ctx.addIssue({ code: "custom", message: "odInvalidSurface" });
});
export type ToothAssociation = z.infer<typeof toothAssociationSchema>;
const associations = z.array(toothAssociationSchema).max(52).refine((rows) => new Set(rows.map((r) => r.tooth)).size === rows.length, "odInvalidTooth");
const notes = z.string().trim().max(4000);
const reason = z.string().trim().min(1, "fieldRequired").max(2000);
export const chartConfigSchema = z.object({ dentition: z.enum(dentitions) }).strict();
export const toothStates = ["erupted", "unerupted", "exfoliated", "extracted", "missing", "retained_primary"] as const;
export const toothEventSchema = z.object({ tooth: toothIdSchema, state: z.enum(toothStates), date: rateDateSchema, notes }).strict()
  .refine((v) => !["retained_primary", "exfoliated"].includes(v.state) || toothInfo(v.tooth).primary, "odPrimaryOnly");
export const findingSchema = z.object({
  description: z.string().trim().min(1, "fieldRequired").max(500),
  date: rateDateSchema, notes, teeth: associations.refine((rows) => rows.length > 0),
}).strict();
export const treatmentSchema = z.object({
  planId: z.string().uuid().nullable().default(null),
  procedureId: z.number().int().positive(),
  mode: z.enum(["independent", "group"]),
  teeth: associations,
  date: rateDateSchema, notes,
  price: procedureSchema.shape.defaultPrice,
  replacesId: z.string().uuid().optional(),
}).strict();
export const treatmentStates = ["planned", "in_progress", "completed", "cancelled"] as const;
export const treatmentStatusSchema = z.object({
  status: z.enum(treatmentStates), date: rateDateSchema, notes,
  expectedVersion: z.number().int().positive(),
}).strict();
export const voidSchema = z.object({ reason, date: rateDateSchema }).strict();
export const discountSchema = z.object({
  type: z.enum(["amount", "percent"]),
  value: procedureSchema.shape.defaultPrice,
}).strict().refine((d) => d.type !== "percent" || Number(d.value) <= 100, "discountInvalid");
export type Discount = z.infer<typeof discountSchema>;
export const noDiscount: Discount = { type: "amount", value: "0.00" };
export function moneyCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function moneyString(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}
// Round percentage discounts half up to the nearest cent; never produce negative totals.
export function discountCents(base: bigint, discount: Discount = noDiscount): bigint {
  const value = moneyCents(discount.value);
  const amount = discount.type === "percent" ? (base * value + 5000n) / 10000n : value;
  return amount > base ? base : amount;
}
export function treatmentNet(record: { price: string; discount?: Discount }): bigint {
  const base = moneyCents(record.price);
  return base - discountCents(base, record.discount);
}
export const treatmentEditSchema = z.object({
  discount: discountSchema, date: rateDateSchema, notes,
  expectedVersion: z.number().int().positive(),
}).strict();
export type TreatmentEditInput = z.infer<typeof treatmentEditSchema>;
export const planTotalSchema = z.object({
  planId: z.string().uuid().nullable().default(null),
  discount: discountSchema,
  expectedId: z.string().uuid().nullable(),
}).strict();
export type PlanTotalInput = z.infer<typeof planTotalSchema>;
export type TreatmentInput = z.infer<typeof treatmentSchema>;
export type FindingInput = z.infer<typeof findingSchema>;
export type ToothEventInput = z.infer<typeof toothEventSchema>;
export type TreatmentStatusInput = z.infer<typeof treatmentStatusSchema>;
export type VoidInput = z.infer<typeof voidSchema>;
export type TreatmentStatus = typeof treatmentStates[number];
export type ClinicalEvent = {
  id: string; date: string; notes: string; actorId: string; recordedAt: string;
};
export type ToothEvent = ClinicalEvent & ToothEventInput & { voidReason: string | null };
export type Finding = ClinicalEvent & FindingInput & { voidReason: string | null };
export type Treatment = {
  planId?: string | null;
  discount?: Discount;
  id: string; procedureId: number; code: string; name: string;
  requiresLab?: boolean;
  scope: string; category?: import("./procedures.js").ProcedureInput["category"]; price: string; currency: "USD"; status: TreatmentStatus;
  date: string; notes: string; teeth: ToothAssociation[];
  version: number; voidReason: string | null; replacesId: string | null;
  events: (ClinicalEvent & { status: string })[];
};
export type ChartData = {
  baseCurrency?: Currency;
  effectiveRate?: ExchangeRate | null;
  sessions?: Treatment[];
  historyTreatments?: Treatment[];
  plans?: { id: string; number: number; createdAt: string }[];
  plan?: { id: string; number: number; createdAt: string } | null;
  planDiscount?: { id: string; discount: Discount } | null;
  dentition: Dentition | null; toothEvents: ToothEvent[]; findings: Finding[]; treatments: Treatment[];
};
export function latestToothStates(events: ToothEvent[]) {
  const result = new Map<number, ToothEvent>();
  for (const event of [...events].filter((e) => !e.voidReason).sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt)))
    result.set(event.tooth, event);
  return result;
}
