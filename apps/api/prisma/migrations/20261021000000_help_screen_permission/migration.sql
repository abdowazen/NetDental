INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", 'help', "view", "create", "modify", "delete"
FROM "ScreenPermission" WHERE "screen" = 'settings'
ON CONFLICT ("userId", "screen") DO NOTHING;
