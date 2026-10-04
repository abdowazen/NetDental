CREATE TABLE "Supplier" (
  "id" SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "name" VARCHAR(150) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Supplier_roomId_name_key" ON "Supplier"("roomId", "name");
CREATE INDEX "Supplier_roomId_active_name_idx" ON "Supplier"("roomId", "active", "name");

CREATE TABLE "SupplyItem" (
  "id" SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "name" VARCHAR(150) NOT NULL,
  "brand" VARCHAR(100) NOT NULL,
  "supplierId" INTEGER REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  "defaultQuantity" DECIMAL(18,3) NOT NULL CHECK ("defaultQuantity" >= 0),
  "defaultPrice" DECIMAL(18,2) NOT NULL CHECK ("defaultPrice" >= 0),
  "currency" "Currency" NOT NULL,
  "date" DATE NOT NULL,
  "expiryDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplyItem_expiryDate_check" CHECK ("expiryDate" IS NULL OR "expiryDate" >= "date")
);
CREATE UNIQUE INDEX "SupplyItem_roomId_name_brand_key" ON "SupplyItem"("roomId", "name", "brand");
CREATE INDEX "SupplyItem_roomId_name_idx" ON "SupplyItem"("roomId", "name");
CREATE INDEX "SupplyItem_roomId_brand_idx" ON "SupplyItem"("roomId", "brand");
CREATE INDEX "SupplyItem_roomId_supplierId_idx" ON "SupplyItem"("roomId", "supplierId");
CREATE INDEX "SupplyItem_roomId_expiryDate_idx" ON "SupplyItem"("roomId", "expiryDate");
