CREATE TABLE "Laboratory" (
  "id" SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "name" VARCHAR(150) NOT NULL CHECK (length(trim("name")) > 0),
  "defaultCost" DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK ("defaultCost" >= 0),
  "turnaroundDays" INTEGER NOT NULL DEFAULT 0 CHECK ("turnaroundDays" BETWEEN 0 AND 365),
  "material" VARCHAR(100) NOT NULL DEFAULT '',
  "shade" VARCHAR(40) NOT NULL DEFAULT '',
  "instructions" VARCHAR(2000) NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Laboratory_roomId_name_key" ON "Laboratory"("roomId", "name");
CREATE INDEX "Laboratory_roomId_active_name_idx" ON "Laboratory"("roomId", "active", "name");
ALTER TABLE "Treatment" ADD COLUMN "laboratoryId" INTEGER;
ALTER TABLE "Treatment" ADD CONSTRAINT "Treatment_laboratoryId_fkey"
  FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT;
CREATE INDEX "Treatment_laboratoryId_idx" ON "Treatment"("laboratoryId");
