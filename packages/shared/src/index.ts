import { z } from "zod";
export * from "./access.js";
import type { Access } from "./access.js";
export * from "./currency.js";
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
  .object({ preferredLanguage: languageSchema })
  .strict();
export type User = {
  id: string;
  username: string;
  displayName: string;
  role: "DENTIST" | "ASSISTANT" | "RECEPTIONIST" | "ADMIN";
  access?: Access;
  preferredLanguage: Language;
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
  | "INTERNAL_ERROR"
  | "NOT_FOUND";
export type ApiErrorBody = { error: { code: ErrorCode } };
