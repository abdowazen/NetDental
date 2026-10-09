CREATE TABLE "Appointment" (
  "id" UUID NOT NULL, "roomId" INTEGER NOT NULL, "patientId" INTEGER, "dentistId" TEXT NOT NULL,
  "kind" VARCHAR(16) NOT NULL DEFAULT 'appointment', "date" DATE NOT NULL, "startMinutes" INTEGER NOT NULL,
  "durationMinutes" INTEGER NOT NULL, "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled', "visitReason" VARCHAR(500) NOT NULL DEFAULT '',
  "notes" VARCHAR(4000) NOT NULL DEFAULT '', "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AppointmentEvent" (
  "id" UUID NOT NULL, "appointmentId" UUID NOT NULL, "action" VARCHAR(24) NOT NULL, "data" JSONB NOT NULL,
  "actorId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Appointment_roomId_date_startMinutes_idx" ON "Appointment"("roomId","date","startMinutes");
CREATE INDEX "Appointment_roomId_dentistId_date_startMinutes_idx" ON "Appointment"("roomId","dentistId","date","startMinutes");
CREATE INDEX "Appointment_patientId_date_idx" ON "Appointment"("patientId","date");
CREATE INDEX "AppointmentEvent_appointmentId_createdAt_idx" ON "AppointmentEvent"("appointmentId","createdAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "ScreenPermission" ("userId","screen","view","create","modify","delete") SELECT "id",'appointments',false,false,false,false FROM "User" ON CONFLICT DO NOTHING;
