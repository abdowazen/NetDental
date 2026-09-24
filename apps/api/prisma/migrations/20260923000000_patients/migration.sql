CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SEQUENCE "Patient_id_seq" START WITH 100000;
CREATE TABLE "Patient" (
  "id" INTEGER NOT NULL DEFAULT nextval('"Patient_id_seq"'),
  "firstName" VARCHAR(100) NOT NULL,
  "lastName" VARCHAR(100) NOT NULL,
  "fullName" VARCHAR(201) NOT NULL,
  "phone" VARCHAR(40) NOT NULL,
  "gender" VARCHAR(6) NOT NULL,
  "fatherName" VARCHAR(100) NOT NULL DEFAULT '',
  "job" VARCHAR(20) NOT NULL DEFAULT 'none',
  "age" INTEGER NOT NULL DEFAULT 0,
  "firstVisit" DATE NOT NULL,
  "notes" VARCHAR(4000) NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Patient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Patient_gender_check" CHECK ("gender" IN ('Male', 'Female')),
  CONSTRAINT "Patient_age_check" CHECK ("age" BETWEEN 0 AND 150),
  CONSTRAINT "Patient_job_check" CHECK ("job" IN ('none', 'student', 'employee', 'selfEmployed', 'retired', 'other')),
  CONSTRAINT "Patient_required_check" CHECK (length(trim("firstName")) > 0 AND length(trim("lastName")) > 0 AND length(trim("phone")) > 0),
  CONSTRAINT "Patient_fullName_check" CHECK ("fullName" = "firstName" || ' ' || "lastName")
);
ALTER SEQUENCE "Patient_id_seq" OWNED BY "Patient"."id";
CREATE INDEX "Patient_fullName_search" ON "Patient" USING GIN ("fullName" gin_trgm_ops);
CREATE INDEX "Patient_phone_search" ON "Patient" USING GIN ("phone" gin_trgm_ops);
CREATE INDEX "Patient_fileId_search" ON "Patient" USING GIN (("id"::text) gin_trgm_ops);
