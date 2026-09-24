CREATE TABLE "PatientChart" (
  "patientId" INTEGER PRIMARY KEY REFERENCES "Patient"("id") ON DELETE RESTRICT,
  "dentition" VARCHAR(12) NOT NULL CHECK ("dentition" IN ('adult','pediatric','mixed')),
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ClinicalRecord" (
  "id" UUID PRIMARY KEY,
  "patientId" INTEGER NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT,
  "kind" VARCHAR(12) NOT NULL CHECK ("kind" IN ('tooth','finding')),
  "data" JSONB NOT NULL, "date" DATE NOT NULL, "actorId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidReason" TEXT, "voidDate" DATE, "voidActorId" TEXT
);
CREATE INDEX "ClinicalRecord_patientId_kind_date_idx" ON "ClinicalRecord"("patientId","kind","date");
CREATE TABLE "Treatment" (
  "id" UUID PRIMARY KEY,
  "patientId" INTEGER NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT,
  "procedureId" INTEGER NOT NULL REFERENCES "Procedure"("id") ON DELETE RESTRICT,
  "snapshot" JSONB NOT NULL, "price" DECIMAL(12,2) NOT NULL CHECK ("price" >= 0),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD' CHECK ("currency" = 'USD'),
  "date" DATE NOT NULL, "notes" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK ("status" IN ('planned','in_progress','completed','cancelled')),
  "version" INTEGER NOT NULL DEFAULT 1,
  "voidReason" TEXT,
  "replacesId" UUID REFERENCES "Treatment"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Treatment_patientId_date_idx" ON "Treatment"("patientId","date");
CREATE TABLE "TreatmentTooth" (
  "treatmentId" UUID NOT NULL REFERENCES "Treatment"("id") ON DELETE RESTRICT,
  "tooth" INTEGER NOT NULL CHECK (("tooth" / 10 BETWEEN 1 AND 4 AND "tooth" % 10 BETWEEN 1 AND 8) OR ("tooth" / 10 BETWEEN 5 AND 8 AND "tooth" % 10 BETWEEN 1 AND 5)),
  "surfaces" TEXT[] NOT NULL,
  "role" VARCHAR(12) NOT NULL CHECK ("role" IN ('target','abutment','pontic')),
  PRIMARY KEY ("treatmentId","tooth")
);
CREATE TABLE "TreatmentEvent" (
  "id" UUID PRIMARY KEY,
  "treatmentId" UUID NOT NULL REFERENCES "Treatment"("id") ON DELETE RESTRICT,
  "status" VARCHAR(16) NOT NULL CHECK ("status" IN ('planned','in_progress','completed','cancelled','voided')),
  "date" DATE NOT NULL, "notes" TEXT NOT NULL, "actorId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TreatmentEvent_treatmentId_recordedAt_idx" ON "TreatmentEvent"("treatmentId","recordedAt");
