CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Patient_roomId_fullName_id_idx"
ON "Patient" ("roomId", "fullName", "id");

CREATE INDEX "Patient_roomId_phone_id_idx"
ON "Patient" ("roomId", "phone", "id");

CREATE INDEX "Patient_roomId_firstVisit_id_idx"
ON "Patient" ("roomId", "firstVisit", "id");

CREATE INDEX "Patient_fullName_trgm_idx"
ON "Patient" USING GIN (lower("fullName") gin_trgm_ops);

CREATE INDEX "Patient_phone_trgm_idx"
ON "Patient" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX "Patient_phone_digits_trgm_idx"
ON "Patient" USING GIN ((regexp_replace("phone", '[^0-9]', '', 'g')) gin_trgm_ops);

CREATE INDEX "ClinicalRecord_patient_kind_recordedAt_idx"
ON "ClinicalRecord" ("patientId", "kind", "recordedAt" DESC);

CREATE INDEX "Treatment_patient_plan_createdAt_idx"
ON "Treatment" ("patientId", "planId", "createdAt" DESC);
