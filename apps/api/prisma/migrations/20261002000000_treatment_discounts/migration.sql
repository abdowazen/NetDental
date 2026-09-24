ALTER TABLE "Treatment"
  ADD COLUMN "discountType" VARCHAR(8) NOT NULL DEFAULT 'amount',
  ADD COLUMN "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Treatment_discount_check" CHECK (
    "discountValue" >= 0 AND
    (("discountType" = 'amount' AND "discountValue" <= "price") OR
     ("discountType" = 'percent' AND "discountValue" <= 100))
  );
-- Preserve earlier total overrides for audit and record an equivalent discount where possible.
-- A previous surcharge cannot be represented by a discount; its original value remains in the audit data.
UPDATE "ClinicalRecord" c SET "data" = c."data" || jsonb_build_object(
  'legacyTotal', c."data"->'total',
  'discount', jsonb_build_object('type', 'amount', 'value',
    GREATEST(0, COALESCE((SELECT SUM(t."price") FROM "Treatment" t
      WHERE t."planId" = c."planId" AND t."voidReason" IS NULL AND t."status" <> 'cancelled'), 0)
      - COALESCE((c."data"->>'total')::numeric,
        (SELECT SUM(t."price") FROM "Treatment" t WHERE t."planId" = c."planId" AND t."voidReason" IS NULL AND t."status" <> 'cancelled'), 0))::text))
WHERE c."kind" = 'plan_total' AND NOT (c."data" ? 'discount');
