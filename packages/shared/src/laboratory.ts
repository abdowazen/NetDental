import { z } from "zod";
import { rateDateSchema } from "./currency.js";
import { procedureSchema } from "./procedures.js";

export const labStatuses = ["to_request", "requested", "received", "voided"] as const;
export const labDraftSchema = z.object({ treatmentId: z.string().uuid(), date: rateDateSchema }).strict();
export const labDetailsSchema = z.object({
  laboratory: z.string().trim().max(150),
  cost: procedureSchema.shape.defaultPrice,
  currency: z.enum(["USD", "LBP"]),
  material: z.string().trim().max(100),
  shade: z.string().trim().max(40),
  instructions: z.string().trim().max(2000),
  requestDate: rateDateSchema,
  dueDate: rateDateSchema,
}).strict().refine((value) => value.dueDate >= value.requestDate, { message: "labDateInvalid", path: ["dueDate"] });
export const labTransitionSchema = z.object({ action: z.enum(["requested", "received"]), date: rateDateSchema }).strict();
export type LabDetailsInput = z.infer<typeof labDetailsSchema>;
export type LabRequest = LabDetailsInput & {
  id: string; treatmentId: string; patientId: number; planId: string | null; planNumber: number | null;
  procedureCode: string; procedureName: string; teeth: number[]; status: typeof labStatuses[number];
  receivedDate: string | null; createdAt: string;
  events: { id: string; action: string; date: string; actorId: string; recordedAt: string }[];
};
export type LabSummary = { requests: LabRequest[]; totalCost: string };
