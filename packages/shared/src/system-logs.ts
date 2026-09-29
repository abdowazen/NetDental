import { z } from "zod";

export const systemLogSourceSchema = z.enum(["api", "client"]);
export type SystemLogSource = z.infer<typeof systemLogSourceSchema>;

export const clientSystemLogSchema = z.object({
  code: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(500),
  path: z.string().trim().min(1).max(300),
}).strict();

export const systemLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(30),
  source: z.enum(["all", "api", "client"]).default("all"),
}).strict();

export type SystemLog = {
  id: string;
  level: "error" | "warning";
  source: SystemLogSource;
  code: string;
  message: string;
  method: string;
  path: string;
  userId: string | null;
  createdAt: string;
};

export type SystemLogPage = {
  logs: SystemLog[];
  total: number;
};
