-- A session procedure belongs to a patient even when it has no treatment plan.
ALTER TABLE "Treatment" ALTER COLUMN "planId" DROP NOT NULL;
