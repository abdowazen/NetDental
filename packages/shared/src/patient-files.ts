import { z } from "zod";
import { rateDateSchema } from "./currency.js";

export const patientFileKinds = ["xray", "photo", "document"] as const;
export const patientFileMetadataSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  kind: z.enum(patientFileKinds),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  tooth: z.coerce.number().int().min(11).max(85).nullable(),
  date: rateDateSchema,
  description: z.string().trim().max(2000),
}).strict();
export type PatientFileMetadataInput = z.infer<typeof patientFileMetadataSchema>;
export type PatientFile = PatientFileMetadataInput & {
  id: string;
  patientId: number;
  size: number;
  uploadedAt: string;
};
export type PatientFileList = { files: PatientFile[] };
