CREATE TABLE "BillCategory" (
  "id" SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "name" VARCHAR(150) NOT NULL,
  "description" VARCHAR(2000) NOT NULL DEFAULT '',
  "defaultAmount" DECIMAL(18,2),
  "currency" "Currency" NOT NULL DEFAULT 'USD',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillCategory_defaultAmount_check" CHECK ("defaultAmount" IS NULL OR "defaultAmount" >= 0)
);
CREATE UNIQUE INDEX "BillCategory_roomId_name_key" ON "BillCategory"("roomId", "name");
CREATE INDEX "BillCategory_roomId_active_name_idx" ON "BillCategory"("roomId", "active", "name");
