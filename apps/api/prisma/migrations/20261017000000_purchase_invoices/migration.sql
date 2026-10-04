ALTER TABLE "SupplyItem" ADD COLUMN "currentQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0;

CREATE TABLE "PurchaseInvoice" (
  "id" SERIAL PRIMARY KEY, "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "supplierId" INTEGER NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT, "supplierName" VARCHAR(150) NOT NULL,
  "paymentType" VARCHAR(12) NOT NULL CHECK ("paymentType" IN ('cash', 'account')), "currency" "Currency" NOT NULL,
  "totalAmount" DECIMAL(18,2) NOT NULL CHECK ("totalAmount" > 0), "baseCurrency" "Currency" NOT NULL,
  "baseTotal" DECIMAL(18,2) NOT NULL CHECK ("baseTotal" > 0), "lbpPerUsd" DECIMAL(18,6), "date" DATE NOT NULL,
  "note" VARCHAR(4000) NOT NULL DEFAULT '', "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PurchaseInvoice_roomId_date_idx" ON "PurchaseInvoice"("roomId", "date");
CREATE INDEX "PurchaseInvoice_roomId_supplierId_date_idx" ON "PurchaseInvoice"("roomId", "supplierId", "date");

CREATE TABLE "PurchaseInvoiceLine" (
  "id" SERIAL PRIMARY KEY, "invoiceId" INTEGER NOT NULL REFERENCES "PurchaseInvoice"("id") ON DELETE CASCADE,
  "itemId" INTEGER NOT NULL REFERENCES "SupplyItem"("id") ON DELETE RESTRICT, "itemName" VARCHAR(150) NOT NULL,
  "brand" VARCHAR(100) NOT NULL, "defaultPrice" DECIMAL(18,2) NOT NULL, "defaultQuantity" DECIMAL(18,3) NOT NULL,
  "purchasePrice" DECIMAL(18,2) NOT NULL CHECK ("purchasePrice" > 0), "quantity" DECIMAL(18,3) NOT NULL CHECK ("quantity" > 0),
  "expiryDate" DATE, "lineTotal" DECIMAL(18,2) NOT NULL CHECK ("lineTotal" > 0)
);
CREATE UNIQUE INDEX "PurchaseInvoiceLine_invoiceId_itemId_key" ON "PurchaseInvoiceLine"("invoiceId", "itemId");
CREATE INDEX "PurchaseInvoiceLine_itemId_idx" ON "PurchaseInvoiceLine"("itemId");
