ALTER TABLE "Procedure"
  ADD COLUMN "labDefaultCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "labTurnaroundDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "labMaterial" VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN "labShade" VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN "labInstructions" VARCHAR(2000) NOT NULL DEFAULT '';

CREATE TABLE "LabRequest" (
  "id" UUID PRIMARY KEY,
  "treatmentId" UUID NOT NULL UNIQUE REFERENCES "Treatment"("id") ON DELETE RESTRICT,
  "patientId" INTEGER NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "status" VARCHAR(16) NOT NULL DEFAULT 'to_request' CHECK ("status" IN ('to_request','requested','received')),
  "laboratory" VARCHAR(150) NOT NULL DEFAULT '',
  "cost" DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK ("cost" >= 0),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "material" VARCHAR(100) NOT NULL DEFAULT '',
  "shade" VARCHAR(40) NOT NULL DEFAULT '',
  "instructions" VARCHAR(2000) NOT NULL DEFAULT '',
  "requestDate" DATE,
  "dueDate" DATE,
  "receivedDate" DATE,
  "createdById" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "LabRequest_patientId_status_createdAt_idx" ON "LabRequest"("patientId", "status", "createdAt");
CREATE INDEX "LabRequest_roomId_status_idx" ON "LabRequest"("roomId", "status");

CREATE TABLE "LabRequestEvent" (
  "id" UUID PRIMARY KEY,
  "requestId" UUID NOT NULL REFERENCES "LabRequest"("id") ON DELETE RESTRICT,
  "action" VARCHAR(16) NOT NULL CHECK ("action" IN ('to_request','requested','received','updated')),
  "date" DATE NOT NULL,
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LabRequestEvent_requestId_recordedAt_idx" ON "LabRequestEvent"("requestId", "recordedAt");
