import { z } from "zod";
import { rateDateSchema } from "./currency.js";

export const appointmentStatuses = ["scheduled","confirmed","arrived","in_treatment","completed","cancelled","no_show"] as const;
export const appointmentStatusSchema = z.enum(appointmentStatuses);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "appointmentTimeInvalid");
export const appointmentInputSchema = z.object({
  kind: z.enum(["appointment","block"]).default("appointment"), patientId: z.coerce.number().int().positive().nullable(),
  dentistId: z.string().uuid("fieldRequired"), date: rateDateSchema, startTime: timeSchema,
  durationMinutes: z.coerce.number().int().min(5,"appointmentDurationInvalid").max(720,"appointmentDurationInvalid"),
  visitReason: z.string().trim().max(500,"fieldTooLong"), notes: z.string().trim().max(4000,"fieldTooLong"), allowOverlap: z.boolean().default(false),
}).strict().superRefine((value, context) => { if (value.kind === "appointment" && !value.patientId) context.addIssue({code:"custom",path:["patientId"],message:"fieldRequired"}); });
export const appointmentQuerySchema = z.object({ from: rateDateSchema, to: rateDateSchema, focus: rateDateSchema.optional(), dentistId: z.string().uuid().optional() }).strict().refine(value=>value.to>=value.from,{path:["to"],message:"appointmentDateInvalid"});
export const appointmentStatusInputSchema = z.object({ status: appointmentStatusSchema }).strict();
export type AppointmentInput=z.infer<typeof appointmentInputSchema>;
export type AppointmentStatus=z.infer<typeof appointmentStatusSchema>;
export type Appointment={id:string;kind:"appointment"|"block";patientId:number|null;patientName:string;patientPhone:string;dentistId:string;dentistName:string;date:string;startTime:string;durationMinutes:number;status:AppointmentStatus;visitReason:string;notes:string;createdAt:string;updatedAt:string;history:{id:string;action:string;data:Record<string,unknown>;actorName:string;createdAt:string}[]};
export type AppointmentCalendar={appointments:Appointment[];dentists:{id:string;name:string}[];counts:{scheduled:number;waiting:number;completed:number;noShow:number}};
