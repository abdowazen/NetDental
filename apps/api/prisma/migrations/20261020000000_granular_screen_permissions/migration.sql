-- Split shared menu permissions into the current screens and reports.
INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", 'laboratoriesCatalog', "view", "create", "modify", "delete"
FROM "ScreenPermission" WHERE "screen" = 'actsProcedures'
ON CONFLICT ("userId", "screen") DO NOTHING;

INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", target.screen, "view", "create", "modify", "delete"
FROM "ScreenPermission"
CROSS JOIN (VALUES ('reportNewPatients'), ('reportPatientsStatement'), ('reportLabStatement')) AS target(screen)
WHERE "ScreenPermission"."screen" = 'reportsListing'
ON CONFLICT ("userId", "screen") DO NOTHING;

INSERT INTO "ScreenPermission" ("userId", "screen", "view", "create", "modify", "delete")
SELECT "userId", 'currencySetup', "view", "create", "modify", "delete"
FROM "ScreenPermission" WHERE "screen" = 'settings'
ON CONFLICT ("userId", "screen") DO NOTHING;

DELETE FROM "ScreenPermission" WHERE "screen" IN ('reportsListing', 'reportsAnalytics');
