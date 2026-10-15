CREATE TABLE "SupplyProduct" (
  "id" SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "name" VARCHAR(150) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "SupplyProduct_roomId_name_key" ON "SupplyProduct"("roomId", "name");
CREATE INDEX "SupplyProduct_roomId_name_idx" ON "SupplyProduct"("roomId", "name");

INSERT INTO "SupplyProduct" ("roomId", "name")
SELECT DISTINCT "roomId", "name"
FROM "SupplyItem";

ALTER TABLE "SupplyItem" ADD COLUMN "productId" INTEGER;

UPDATE "SupplyItem" item
SET "productId" = product."id"
FROM "SupplyProduct" product
WHERE product."roomId" = item."roomId"
  AND product."name" = item."name";

ALTER TABLE "SupplyItem" ALTER COLUMN "productId" SET NOT NULL;
ALTER TABLE "SupplyItem"
  ADD CONSTRAINT "SupplyItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "SupplyProduct"("id") ON DELETE RESTRICT;

CREATE TABLE "SupplyItemSupplier" (
  "itemId" INTEGER NOT NULL REFERENCES "SupplyItem"("id") ON DELETE CASCADE,
  "supplierId" INTEGER NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("itemId", "supplierId")
);

INSERT INTO "SupplyItemSupplier" ("itemId", "supplierId")
SELECT "id", "supplierId"
FROM "SupplyItem"
WHERE "supplierId" IS NOT NULL;

CREATE INDEX "SupplyItemSupplier_supplierId_itemId_idx" ON "SupplyItemSupplier"("supplierId", "itemId");

DROP INDEX "SupplyItem_roomId_name_brand_key";
DROP INDEX "SupplyItem_roomId_supplierId_idx";
ALTER TABLE "SupplyItem" DROP CONSTRAINT "SupplyItem_supplierId_fkey";
ALTER TABLE "SupplyItem" DROP COLUMN "supplierId";

CREATE UNIQUE INDEX "SupplyItem_productId_brand_key" ON "SupplyItem"("productId", "brand");
CREATE INDEX "SupplyItem_roomId_productId_idx" ON "SupplyItem"("roomId", "productId");
