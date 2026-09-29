ALTER TABLE "LabRequest" DROP CONSTRAINT "LabRequest_status_check";
ALTER TABLE "LabRequest" ADD CONSTRAINT "LabRequest_status_check" CHECK ("status" IN ('to_request','requested','received','voided'));

ALTER TABLE "LabRequestEvent" DROP CONSTRAINT "LabRequestEvent_action_check";
ALTER TABLE "LabRequestEvent" ADD CONSTRAINT "LabRequestEvent_action_check" CHECK ("action" IN ('to_request','requested','received','updated','voided'));
