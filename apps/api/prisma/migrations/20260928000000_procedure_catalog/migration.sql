CREATE TABLE "Procedure" (
  "id" SERIAL PRIMARY KEY,
  "roomId" INTEGER NOT NULL REFERENCES "SurgicalRoom"("id"),
  "code" VARCHAR(40) NOT NULL CHECK (length(trim("code")) > 0 AND "code" = upper(trim("code"))),
  "name" VARCHAR(150) NOT NULL CHECK (length(trim("name")) > 0),
  "category" VARCHAR(40) NOT NULL CHECK ("category" IN ('consultation_diagnosis', 'prevention_hygiene', 'restorative_dentistry', 'endodontics', 'periodontics', 'oral_surgery', 'fixed_prosthodontics', 'removable_prosthodontics', 'implantology', 'orthodontics', 'cosmetic_dentistry', 'imaging', 'other')),
  "description" VARCHAR(4000) NOT NULL DEFAULT '',
  "defaultPrice" DECIMAL(12,2) NOT NULL CHECK ("defaultPrice" >= 0),
  "dentition" VARCHAR(20) NOT NULL CHECK ("dentition" IN ('permanent', 'primary', 'both')),
  "scope" VARCHAR(20) NOT NULL CHECK ("scope" IN ('single_tooth', 'tooth_surfaces', 'multiple_teeth', 'whole_mouth')),
  "requiresLab" BOOLEAN NOT NULL DEFAULT false,
  "chartIndicator" VARCHAR(30) NOT NULL DEFAULT 'generic' CHECK ("chartIndicator" = 'generic'),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Procedure_roomId_code_key" ON "Procedure"("roomId", "code");
CREATE INDEX "Procedure_roomId_id_idx" ON "Procedure"("roomId", "id");
CREATE INDEX "Procedure_code_search_idx" ON "Procedure" USING gin ("code" gin_trgm_ops);
CREATE INDEX "Procedure_name_search_idx" ON "Procedure" USING gin ("name" gin_trgm_ops);
