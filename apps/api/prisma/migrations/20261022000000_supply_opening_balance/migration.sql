ALTER TABLE "SupplyItem" RENAME COLUMN "defaultQuantity" TO "openingBalance";

UPDATE "SupplyItem"
SET "currentQuantity" = "currentQuantity" + "openingBalance";

ALTER TABLE "SupplyItem" ALTER COLUMN "openingBalance" SET DEFAULT 0;

ALTER TABLE "PurchaseInvoiceLine" DROP COLUMN "defaultQuantity";
