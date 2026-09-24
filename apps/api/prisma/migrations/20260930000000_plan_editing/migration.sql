ALTER TABLE "ClinicalRecord" DROP CONSTRAINT "ClinicalRecord_kind_check";
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_kind_check"
  CHECK ("kind" IN ('tooth', 'finding', 'plan_total'));
ALTER TABLE "TreatmentEvent" DROP CONSTRAINT "TreatmentEvent_status_check";
ALTER TABLE "TreatmentEvent" ADD CONSTRAINT "TreatmentEvent_status_check"
  CHECK ("status" IN ('planned', 'in_progress', 'completed', 'cancelled', 'voided', 'edited'));
