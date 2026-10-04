CREATE TABLE "LaboratoryProcedureRate" (
  "id" SERIAL PRIMARY KEY,
  "laboratoryId" INTEGER NOT NULL REFERENCES "Laboratory"("id") ON DELETE RESTRICT,
  "procedureId" INTEGER NOT NULL REFERENCES "Procedure"("id") ON DELETE RESTRICT,
  "cost" DECIMAL(18,2) NOT NULL CHECK ("cost" >= 0),
  "currency" "Currency" NOT NULL DEFAULT 'USD',
  "turnaroundDays" INTEGER NOT NULL DEFAULT 0 CHECK ("turnaroundDays" BETWEEN 0 AND 365),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "LaboratoryProcedureRate_laboratoryId_procedureId_key"
  ON "LaboratoryProcedureRate"("laboratoryId", "procedureId");
CREATE INDEX "LaboratoryProcedureRate_procedureId_active_idx"
  ON "LaboratoryProcedureRate"("procedureId", "active");
