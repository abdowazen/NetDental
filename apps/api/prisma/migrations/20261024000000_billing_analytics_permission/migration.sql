INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", 'reportBillingPayments', "view", "create", "modify", "delete"
FROM "ScreenPermission"
WHERE "screen" = 'billsPayments'
ON CONFLICT ("userId", "screen") DO NOTHING;
