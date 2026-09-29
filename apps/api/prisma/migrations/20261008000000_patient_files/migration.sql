CREATE TABLE "PatientFile" (
  "id" UUID NOT NULL,
  "patientId" INTEGER NOT NULL,
  "roomId" INTEGER NOT NULL,
  "storedName" VARCHAR(80) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(12) NOT NULL,
  "mimeType" VARCHAR(80) NOT NULL,
  "size" INTEGER NOT NULL,
  "tooth" INTEGER,
  "date" DATE NOT NULL,
  "description" VARCHAR(2000) NOT NULL DEFAULT '',
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientFile_kind_check" CHECK ("kind" IN ('xray','photo','document')),
  CONSTRAINT "PatientFile_size_check" CHECK ("size" > 0 AND "size" <= 15728640),
  CONSTRAINT "PatientFile_tooth_check" CHECK ("tooth" IS NULL OR "tooth" BETWEEN 11 AND 85),
  CONSTRAINT "PatientFile_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PatientFile_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "SurgicalRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PatientFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PatientFile_storedName_key" ON "PatientFile"("storedName");
CREATE INDEX "PatientFile_patientId_date_createdAt_idx" ON "PatientFile"("patientId", "date", "createdAt");
CREATE INDEX "PatientFile_roomId_kind_idx" ON "PatientFile"("roomId", "kind");
