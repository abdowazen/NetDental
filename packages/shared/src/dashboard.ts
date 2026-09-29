import { z } from "zod";

export const dashboardPeriodSchema = z.enum(["monthly", "yearly"]);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;
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
