/*
  NetDenty data reset for pgAdmin Query Tool

  1. Stop the NetDenty API and desktop application.
  2. Back up the database.
  3. Connect pgAdmin to the NetDenty database.
  4. Set execute_reset to true below.
  5. Leave include_configuration false for the normal operational reset.
  6. Set include_configuration true only for a full reset. In that mode,
     set administrator_username to an existing active administrator. That
     administrator is recreated with the same password after the reset.

  PostgreSQL cannot erase patient files from the server filesystem. This
  script removes their database records only.
*/

DO $reset$
DECLARE
  execute_reset boolean := false;
  include_configuration boolean := false;
  administrator_username text := 'administrator';

  tables_to_truncate text;
  admin_id text;
  admin_username text;
  admin_password_hash text;
  admin_display_name text;
  admin_language "Language";
  clinic_id integer;
  room_id integer;
BEGIN
  IF NOT execute_reset THEN
    RAISE EXCEPTION
      'Reset cancelled. Set execute_reset to true after reviewing the script.';
  END IF;

  IF include_configuration THEN
    SELECT
      id,
      username,
      "passwordHash",
      "displayName",
      "preferredLanguage"
    INTO
      admin_id,
      admin_username,
      admin_password_hash,
      admin_display_name,
      admin_language
    FROM "User"
    WHERE username = administrator_username
      AND role = 'ADMIN'
      AND "isActive" = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Active administrator "%" was not found. No data was changed.',
        administrator_username;
    END IF;
  END IF;

  SELECT string_agg(
           format('%I.%I', schemaname, tablename),
           ', ' ORDER BY tablename
         )
  INTO tables_to_truncate
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('_prisma_migrations', 'Unit')
    AND (
      include_configuration
      OR tablename NOT IN (
        'User',
        'Clinic',
        'SurgicalRoom',
        'RoomAssignment',
        'ScreenPermission',
        'CurrencySettings',
        'ExchangeRate'
      )
    );

  IF tables_to_truncate IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate ||
            ' RESTART IDENTITY CASCADE';
  END IF;

  IF include_configuration THEN
    INSERT INTO "Clinic" (name)
    VALUES ('Main Clinic')
    RETURNING id INTO clinic_id;

    INSERT INTO "SurgicalRoom" (name, "clinicId")
    VALUES ('Room 1', clinic_id)
    RETURNING id INTO room_id;

    INSERT INTO "CurrencySettings" (id, "baseCurrency", "updatedAt")
    VALUES (room_id, 'USD', CURRENT_TIMESTAMP);

    INSERT INTO "User" (
      id,
      username,
      "passwordHash",
      "displayName",
      role,
      "preferredLanguage",
      "isActive",
      "createdAt",
      "updatedAt"
    ) VALUES (
      admin_id,
      admin_username,
      admin_password_hash,
      admin_display_name,
      'ADMIN',
      admin_language,
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;

  RAISE NOTICE '% reset completed.',
    CASE
      WHEN include_configuration THEN 'Full configuration and operational'
      ELSE 'Operational'
    END;
END
$reset$;
