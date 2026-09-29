ALTER TABLE "Procedure" ADD COLUMN "labLaboratory" VARCHAR(150) NOT NULL DEFAULT '';

INSERT INTO "TreatmentEvent" ("id", "treatmentId", "status", "date", "notes", "actorId", "recordedAt")
SELECT md5(lr."id"::text || '-lab-in-progress')::uuid, t."id", 'in_progress',
       COALESCE(lr."requestDate", lr."createdAt"::date), 'Laboratory request created', lr."createdById", lr."createdAt"
FROM "LabRequest" lr
JOIN "Treatment" t ON t."id" = lr."treatmentId"
WHERE t."status" = 'planned'
  AND NOT EXISTS (SELECT 1 FROM "TreatmentEvent" e WHERE e."treatmentId" = t."id" AND e."status" = 'in_progress');

UPDATE "Treatment" t
SET "status" = 'in_progress', "version" = "version" + 1
WHERE t."status" = 'planned' AND EXISTS (SELECT 1 FROM "LabRequest" lr WHERE lr."treatmentId" = t."id");
