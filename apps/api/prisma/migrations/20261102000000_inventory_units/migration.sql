CREATE TABLE "Unit" (
  "id" SERIAL NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "symbol" VARCHAR(30) NOT NULL,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- Piece is deliberately ID 1 for existing items and older API clients.
INSERT INTO "Unit" ("name", "symbol") VALUES
('Piece', 'pc'), ('Pair', 'pair'), ('Set', 'set'), ('Kit', 'kit'),
('Pack', 'pack'), ('Box', 'box'), ('Carton', 'carton'), ('Case', 'case'),
('Bag', 'bag'), ('Pouch', 'pouch'), ('Sachet', 'sachet'), ('Blister', 'blister'),
('Tray', 'tray'), ('Roll', 'roll'), ('Reel', 'reel'), ('Sheet', 'sheet'),
('Strip', 'strip'), ('Pad', 'pad'), ('Bottle', 'bottle'), ('Vial', 'vial'),
('Ampoule', 'ampoule'), ('Jar', 'jar'), ('Can', 'can'), ('Canister', 'canister'),
('Tube', 'tube'), ('Syringe', 'syringe'), ('Cartridge', 'cartridge'),
('Capsule', 'capsule'), ('Compule', 'compule'), ('Dose', 'dose'),
('Tablet', 'tablet'), ('Drop', 'drop'), ('Stick', 'stick'),
('Milligram', 'mg'), ('Gram', 'g'), ('Kilogram', 'kg'),
('Microlitre', 'µL'), ('Millilitre', 'mL'), ('Litre', 'L'),
('Millimetre', 'mm'), ('Centimetre', 'cm'), ('Metre', 'm'),
('Square centimetre', 'cm²'), ('Square metre', 'm²');

ALTER TABLE "SupplyItem" ADD COLUMN "unitId" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
