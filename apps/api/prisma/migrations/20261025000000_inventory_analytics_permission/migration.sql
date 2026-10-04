INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", 'reportInventoryAnalytics', "view", "create", "modify", "delete"
FROM "ScreenPermission"
WHERE "screen" = 'purchaseInvoice'
ON CONFLICT ("userId", "screen") DO NOTHING;
