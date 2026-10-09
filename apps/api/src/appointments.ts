import type { PrismaClient, Prisma } from "@prisma/client";
import type { Appointment, AppointmentCalendar, AppointmentInput, AppointmentStatus } from "@clinic/shared";

const include = { patient: true, dentist: true, events: { include: { actor: true }, orderBy: { createdAt: "asc" as const } } } satisfies Prisma.AppointmentInclude;
type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof include }>;
const activeStatuses = ["scheduled", "confirmed", "arrived", "in_treatment"];
const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const json = (value: unknown) => value as Prisma.InputJsonValue;

function publicAppointment(row: AppointmentRow): Appointment {
  return { id:row.id,kind:row.kind as Appointment["kind"],patientId:row.patientId,patientName:row.patient?.fullName??"",patientPhone:row.patient?.phone??"",dentistId:row.dentistId,dentistName:row.dentist.displayName,date:row.date.toISOString().slice(0,10),startTime:time(row.startMinutes),durationMinutes:row.durationMinutes,status:row.status as AppointmentStatus,visitReason:row.visitReason,notes:row.notes,createdAt:row.createdAt.toISOString(),updatedAt:row.updatedAt.toISOString(),history:row.events.map((event)=>({id:event.id,action:event.action,data:event.data as Record<string,unknown>,actorName:event.actor.displayName,createdAt:event.createdAt.toISOString()})) };
}
export class AppointmentOverlapError extends Error {}
export interface AppointmentStore {
  getAppointments(roomId:number,query:{from:string;to:string;focus?:string;dentistId?:string}):Promise<AppointmentCalendar>;
  findAppointment(id:string,roomId:number):Promise<Appointment|null>;
  createAppointment(input:AppointmentInput,roomId:number,actorId:string):Promise<Appointment>;
  updateAppointment(id:string,input:AppointmentInput,roomId:number,actorId:string):Promise<Appointment|null>;
  setAppointmentStatus(id:string,status:AppointmentStatus,roomId:number,actorId:string):Promise<Appointment|null>;
  deleteAppointment(id:string,roomId:number):Promise<boolean>;
}
export function appointmentStore(db:PrismaClient):AppointmentStore {
  async function conflict(input:AppointmentInput,roomId:number,exclude?:string){const start=minutes(input.startTime),end=start+input.durationMinutes;const rows=await db.appointment.findMany({where:{roomId,dentistId:input.dentistId,date:date(input.date),id:exclude?{not:exclude}:undefined,status:{in:activeStatuses}}});return rows.some(row=>row.startMinutes<end&&row.startMinutes+row.durationMinutes>start);}
  async function dentistAllowed(dentistId:string,roomId:number){return Boolean(await db.user.findFirst({where:{id:dentistId,isActive:true,role:"DENTIST",assignments:{some:{roomId}}},select:{id:true}}));}
  async function patientAllowed(patientId:number|null,roomId:number,kind:string){return kind==="block"||Boolean(patientId&&await db.patient.findFirst({where:{id:patientId,roomId},select:{id:true}}));}
  return {
    async getAppointments(roomId,query){const [rows,dentists]=await Promise.all([db.appointment.findMany({where:{roomId,date:{gte:date(query.from),lte:date(query.to)},dentistId:query.dentistId||undefined},include,orderBy:[{date:"asc"},{startMinutes:"asc"}]}),db.user.findMany({where:{isActive:true,role:"DENTIST",assignments:{some:{roomId}}},select:{id:true,displayName:true},orderBy:{displayName:"asc"}})]);const appointments=rows.map(publicAppointment);const dayRows=appointments.filter(row=>row.date===(query.focus??query.from)&&row.kind==="appointment");return{appointments,dentists:dentists.map(row=>({id:row.id,name:row.displayName})),counts:{scheduled:dayRows.filter(row=>["scheduled","confirmed"].includes(row.status)).length,waiting:dayRows.filter(row=>row.status==="arrived").length,completed:dayRows.filter(row=>row.status==="completed").length,noShow:dayRows.filter(row=>row.status==="no_show").length}};},
    async findAppointment(id,roomId){const row=await db.appointment.findFirst({where:{id,roomId},include});return row?publicAppointment(row):null;},
    async createAppointment(input,roomId,actorId){if(!await dentistAllowed(input.dentistId,roomId)||!await patientAllowed(input.patientId,roomId,input.kind))throw new Error("INVALID_APPOINTMENT_REFERENCE");if(!input.allowOverlap&&await conflict(input,roomId))throw new AppointmentOverlapError();const row=await db.appointment.create({data:{roomId,patientId:input.kind==="block"?null:input.patientId,dentistId:input.dentistId,kind:input.kind,date:date(input.date),startMinutes:minutes(input.startTime),durationMinutes:input.durationMinutes,status:"scheduled",visitReason:input.visitReason,notes:input.notes,createdById:actorId,events:{create:{action:input.kind==="block"?"blocked":"created",data:json({date:input.date,startTime:input.startTime,durationMinutes:input.durationMinutes}),actorId}}},include});return publicAppointment(row);},
    async updateAppointment(id,input,roomId,actorId){const previous=await db.appointment.findFirst({where:{id,roomId}});if(!previous)return null;if(!await dentistAllowed(input.dentistId,roomId)||!await patientAllowed(input.patientId,roomId,input.kind))throw new Error("INVALID_APPOINTMENT_REFERENCE");if(!input.allowOverlap&&activeStatuses.includes(previous.status)&&await conflict(input,roomId,id))throw new AppointmentOverlapError();const rescheduled=previous.date.toISOString().slice(0,10)!==input.date||previous.startMinutes!==minutes(input.startTime)||previous.durationMinutes!==input.durationMinutes||previous.dentistId!==input.dentistId;const row=await db.appointment.update({where:{id},data:{patientId:input.kind==="block"?null:input.patientId,dentistId:input.dentistId,kind:input.kind,date:date(input.date),startMinutes:minutes(input.startTime),durationMinutes:input.durationMinutes,visitReason:input.visitReason,notes:input.notes,events:{create:{action:rescheduled?"rescheduled":"updated",data:json({from:{date:previous.date.toISOString().slice(0,10),startTime:time(previous.startMinutes),durationMinutes:previous.durationMinutes,dentistId:previous.dentistId},to:{date:input.date,startTime:input.startTime,durationMinutes:input.durationMinutes,dentistId:input.dentistId}}),actorId}}},include});return publicAppointment(row);},
    async setAppointmentStatus(id,status,roomId,actorId){const previous=await db.appointment.findFirst({where:{id,roomId}});if(!previous)return null;const row=await db.appointment.update({where:{id},data:{status,events:{create:{action:`status_${status}`,data:json({from:previous.status,to:status}),actorId}}},include});return publicAppointment(row);},
    async deleteAppointment(id,roomId){return db.$transaction(async(transaction)=>{const appointment=await transaction.appointment.findFirst({where:{id,roomId},select:{id:true}});if(!appointment)return false;await transaction.appointmentEvent.deleteMany({where:{appointmentId:id}});await transaction.appointment.delete({where:{id}});return true;});},
  };
}




