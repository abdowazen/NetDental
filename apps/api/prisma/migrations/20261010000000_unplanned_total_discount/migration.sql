ALTER TABLE "ClinicalRecord" DROP CONSTRAINT "ClinicalRecord_kind_check";
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_kind_check"
  CHECK ("kind" IN ('tooth', 'finding', 'plan_total', 'unplan_total'));
