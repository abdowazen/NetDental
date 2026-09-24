CREATE INDEX "Patient_phone_digits_search" ON "Patient" USING GIN ((regexp_replace("phone", '[^0-9]', '', 'g')) gin_trgm_ops);
