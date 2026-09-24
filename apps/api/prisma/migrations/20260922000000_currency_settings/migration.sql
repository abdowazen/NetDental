CREATE TYPE "Currency" AS ENUM ('USD', 'LBP');

CREATE TABLE "CurrencySettings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "baseCurrency" "Currency" NOT NULL DEFAULT 'USD',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CurrencySettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CurrencySettings_singleton" CHECK ("id" = 1)
);

CREATE TABLE "ExchangeRate" (
  "date" DATE NOT NULL,
  "lbpPerUsd" DECIMAL(18,6) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("date"),
  CONSTRAINT "ExchangeRate_positive" CHECK ("lbpPerUsd" > 0)
);

INSERT INTO "CurrencySettings" ("id", "baseCurrency", "updatedAt") VALUES (1, 'USD', CURRENT_TIMESTAMP);
