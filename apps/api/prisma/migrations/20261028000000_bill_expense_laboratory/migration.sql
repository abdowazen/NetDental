ALTER TABLE "BillExpense"
ADD COLUMN "laboratoryId" INTEGER,
ADD COLUMN "laboratoryName" VARCHAR(150);

ALTER TABLE "BillExpense"
ADD CONSTRAINT "BillExpense_laboratoryId_fkey"
FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "BillExpense_roomId_laboratoryId_date_idx"
ON "BillExpense"("roomId", "laboratoryId", "date");
