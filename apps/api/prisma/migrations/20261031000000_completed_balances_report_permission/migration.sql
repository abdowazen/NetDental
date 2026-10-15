INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", 'reportCompletedBalances', "view", false, false, false
FROM "ScreenPermission"
WHERE "screen" = 'reportPatientsStatement'
ON CONFLICT ("userId", "screen") DO NOTHING;
