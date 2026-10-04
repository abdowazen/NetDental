import { z } from "zod";

export const dashboardPeriodSchema = z.enum(["monthly", "yearly", "custom"]);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
export const dashboardQuerySchema = z.object({
  period: dashboardPeriodSchema.default("monthly"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict().refine((value) => (!value.from && !value.to) || Boolean(value.from && value.to && value.to >= value.from), { path: ["to"], message: "dashboardDateInvalid" });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardBucket = { key: string; charges: string; payments: string; labRequested: string; labReceived: string; registrations: number };
export type DashboardSummary = {
  period: DashboardPeriod;
  currency: "USD" | "LBP";
  patientsTreatedToday: number;
  paymentsReceivedToday: string;
  outstandingBalance: string;
  pendingLabRequests: number;
  buckets: DashboardBucket[];
  procedures: { name: string; count: number }[];
};
