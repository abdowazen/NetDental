CREATE TABLE "TreatmentPlan" (
  "id" UUID PRIMARY KEY,
  "patientId" INTEGER NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT,
  "number" INTEGER NOT NULL CHECK ("number" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" TEXT,
  UNIQUE ("patientId", "number"),
  UNIQUE ("id", "patientId")
);
-- Preserve the existing treatment collection as the patient's first plan.
INSERT INTO "TreatmentPlan" ("id", "patientId", "number", "createdAt")
SELECT gen_random_uuid(), "patientId", 1, MIN("createdAt") FROM (
  SELECT "patientId", "createdAt" FROM "Treatment"
  UNION ALL SELECT "patientId", "recordedAt" FROM "ClinicalRecord" WHERE "kind" = 'plan_total'
) AS legacy GROUP BY "patientId";
ALTER TABLE "Treatment" ADD COLUMN "planId" UUID;
UPDATE "Treatment" t SET "planId" = p."id" FROM "TreatmentPlan" p WHERE p."patientId" = t."patientId";
ALTER TABLE "Treatment" ALTER COLUMN "planId" SET NOT NULL;
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_planId_patientId_fkey"
  FOREIGN KEY ("planId", "patientId") REFERENCES "TreatmentPlan"("id", "patientId") ON DELETE RESTRICT;
ALTER TABLE "ClinicalRecord" ADD COLUMN "planId" UUID;
UPDATE "ClinicalRecord" c SET "planId" = p."id" FROM "TreatmentPlan" p
  WHERE p."patientId" = c."patientId" AND c."kind" = 'plan_total';
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_planId_patientId_fkey"
  FOREIGN KEY ("planId", "patientId") REFERENCES "TreatmentPlan"("id", "patientId") ON DELETE RESTRICT;
CREATE INDEX "Treatment_planId_idx" ON "Treatment"("planId");
CREATE INDEX "ClinicalRecord_planId_idx" ON "ClinicalRecord"("planId");
