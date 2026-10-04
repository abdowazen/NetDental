ALTER TABLE "Supplier"
  ADD COLUMN "phone" VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN "address" VARCHAR(500) NOT NULL DEFAULT '';

CREATE INDEX "Supplier_roomId_phone_idx" ON "Supplier"("roomId", "phone");
