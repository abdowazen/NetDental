import { z } from "zod";
export * from "./access.js";
import {
  defaultPageSchema,
  type Access,
  type DefaultPage,
} from "./access.js";
export * from "./currency.js";
export * from "./payments.js";
export * from "./laboratory.js";
export * from "./laboratory-catalog.js";
export * from "./bill-categories.js";
export * from "./bill-expenses.js";
export * from "./inventory.js";
export * from "./purchase-invoices.js";
export * from "./patient-files.js";
export * from "./dashboard.js";
export * from "./appointments.js";
export * from "./reports.js";
export * from "./system-logs.js";
export * from "./patients.js";
export * from "./procedures.js";
export * from "./odontogram.js";
export const languageSchema = z.enum(["en", "fr"]);
export type Language = z.infer<typeof languageSchema>;
// ASCII only, trim and lowercase: deterministic across clients and database locales.
export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/)
  .transform((s) => s.toLowerCase());
export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();
export const createDentistSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(100),
    preferredLanguage: languageSchema.default("en"),
  })
  .strict();
export const preferencesSchema = z
  .object({
    preferredLanguage: languageSchema.optional(),
    defaultPage: defaultPageSchema.optional(),
  })
  .strict()
  .refine((value) => value.preferredLanguage || value.defaultPage);
export type User = {
  id: string;
  username: string;
  displayName: string;
  role: "DENTIST" | "ASSISTANT" | "RECEPTIONIST" | "ADMIN";
  access?: Access;
  preferredLanguage: Language;
  defaultPage: DefaultPage;
  createdAt: string;
};
export type ErrorCode =
  | "CONFLICT"
  | "LOCATION_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "BACKUP_BUSY"
  | "BACKUP_TOOL_UNAVAILABLE"
  | "BACKUP_FAILED"
  | "RESTORE_FAILED"
  | "INVALID_BACKUP_FILE"
  | "INTERNAL_ERROR"
  | "NOT_FOUND";
export type ApiErrorBody = { error: { code: ErrorCode } };
