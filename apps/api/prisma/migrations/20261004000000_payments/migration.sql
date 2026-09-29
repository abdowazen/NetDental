CREATE TABLE "Payment" (
  "id" UUID PRIMARY KEY,
  "patientId" INTEGER NOT NULL REFERENCES "Patient"("id") ON DELETE RESTRICT,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT,
  "planId" UUID,
  "amount" DECIMAL(18,2) NOT NULL CHECK ("amount" > 0),
  "currency" "Currency" NOT NULL,
  "baseCurrency" "Currency" NOT NULL,
  "baseAmount" DECIMAL(18,2) NOT NULL CHECK ("baseAmount" > 0),
  "lbpPerUsd" DECIMAL(18,6),
  "method" VARCHAR(24) NOT NULL CHECK ("method" IN ('cash','card','bank_transfer','check','other')),
  "date" DATE NOT NULL,
  "note" VARCHAR(4000) NOT NULL DEFAULT '',
  "actorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_planId_patientId_fkey" FOREIGN KEY ("planId", "patientId")
    REFERENCES "TreatmentPlan"("id", "patientId") ON DELETE RESTRICT
);
CREATE INDEX "Payment_patientId_planId_date_idx" ON "Payment"("patientId", "planId", "date");
CREATE INDEX "Payment_roomId_date_idx" ON "Payment"("roomId", "date");
