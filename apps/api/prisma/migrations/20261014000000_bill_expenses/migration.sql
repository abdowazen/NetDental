CREATE TABLE "BillExpense" (
  "id" UUID PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "categoryId" INTEGER NOT NULL REFERENCES "BillCategory"("id") ON DELETE RESTRICT,
  "categoryName" VARCHAR(150) NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "currency" "Currency" NOT NULL,
  "baseCurrency" "Currency" NOT NULL,
  "baseAmount" DECIMAL(18,2) NOT NULL CHECK ("baseAmount" > 0),
  "lbpPerUsd" DECIMAL(18,6),
  "method" VARCHAR(16) NOT NULL,
  "date" DATE NOT NULL,
  "note" VARCHAR(4000) NOT NULL DEFAULT '',
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillExpense_method_check" CHECK ("method" IN ('cash', 'card', 'cheque'))
);
CREATE INDEX "BillExpense_roomId_date_idx" ON "BillExpense"("roomId", "date");
CREATE INDEX "BillExpense_roomId_categoryId_date_idx" ON "BillExpense"("roomId", "categoryId", "date");
