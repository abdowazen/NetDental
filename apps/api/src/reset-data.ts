import "dotenv/config";
import { randomBytes } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { basename, parse, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { usernameSchema } from "@clinic/shared";
import { passwordOptions } from "./app.js";

const FILE_CONFIRMATION = "DELETE PATIENT FILES";
const includeFiles = process.argv.includes("--include-files");
const includeConfiguration = process.argv.includes("--include-configuration");
const CONFIRMATION = includeConfiguration
  ? "RESET ALL NETDENTY DATA"
  : "RESET NETDENTY OPERATIONAL DATA";
const preservedTables = includeConfiguration
  ? ["_prisma_migrations", "Unit"]
  : [
      "_prisma_migrations",
      "Unit",
      "User",
      "Clinic",
      "SurgicalRoom",
      "RoomAssignment",
      "ScreenPermission",
      "CurrencySettings",
      "ExchangeRate",
    ];
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
if (!process.stdin.isTTY)
  throw new Error("The reset utility must be run from an interactive terminal.");

const target = new URL(databaseUrl);
const databaseName = target.pathname.replace(/^\//, "") || "postgres";
const db = new PrismaClient();
const rl = createInterface({ input: process.stdin, output: process.stdout });

function patientFilesDirectory() {
  const directory = resolve(
    process.env.PATIENT_FILES_DIR ?? "data/patient-files",
  );
  if (directory === parse(directory).root || !basename(directory))
    throw new Error("Refusing to erase an unsafe patient-files path.");
  return directory;
}

try {
  console.log(
    includeConfiguration
      ? "\nNetDenty full data reset"
      : "\nNetDenty operational data reset",
  );
  console.log(`Database: ${databaseName}`);
  console.log(`Server:   ${target.hostname}:${target.port || "5432"}`);
  console.log("Stop the NetDenty API and desktop application before continuing.");
  console.log("The database schema and Prisma migration history will be kept.");
  if (includeConfiguration) {
    console.log("All configuration and operational data will be erased.");
    console.log("A base clinic, room, currency setting and administrator will be recreated.");
  } else {
    console.log("Operational records, including appointments, will be erased.");
    console.log(
      "Users, clinics, rooms, assignments, permissions, currency setup and exchange rates will be kept.",
    );
  }
  if (includeFiles)
    console.log(`Patient files will also be erased from: ${patientFilesDirectory()}`);

  const confirmation = await rl.question(`\nType ${CONFIRMATION} to continue: `);
  if (confirmation !== CONFIRMATION) {
    console.log("Reset cancelled. No data was changed.");
    process.exitCode = 1;
  } else {
    if (includeFiles) {
      const fileConfirmation = await rl.question(
        `Type ${FILE_CONFIRMATION} to confirm file deletion: `,
      );
      if (fileConfirmation !== FILE_CONFIRMATION) {
        console.log("Reset cancelled. No data was changed.");
        process.exitCode = 1;
        throw new Error("RESET_CANCELLED");
      }
    }

    const username = includeConfiguration
      ? usernameSchema.parse(process.env.ADMIN_USERNAME ?? "administrator")
      : null;
    const password = includeConfiguration
      ? (process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url"))
      : null;
    if (password && (password.length < 12 || password.length > 128))
      throw new Error("ADMIN_PASSWORD must contain 12-128 characters.");
    const passwordHash = password
      ? await hash(password, passwordOptions)
      : null;
    const preservedTableSql = preservedTables
      .map((table) => `'${table}'`)
      .join(", ");

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        DO $$
        DECLARE tables_to_truncate text;
        BEGIN
          SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
            INTO tables_to_truncate
            FROM pg_tables
           WHERE schemaname = 'public'
             AND tablename NOT IN (${preservedTableSql});

          IF tables_to_truncate IS NOT NULL THEN
            EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate ||
                    ' RESTART IDENTITY CASCADE';
          END IF;
        END $$;
      `);
      if (includeConfiguration && username && passwordHash) {
        const clinic = await tx.clinic.create({ data: { name: "Main Clinic" } });
        const room = await tx.surgicalRoom.create({
          data: { clinicId: clinic.id, name: "Room 1" },
        });
        await tx.currencySettings.create({
          data: { id: room.id, baseCurrency: "USD" },
        });
        await tx.user.create({
          data: {
            username,
            displayName: "Administrator",
            role: "ADMIN",
            passwordHash,
          },
        });
      }
    });

    if (includeFiles) {
      const directory = patientFilesDirectory();
      await rm(directory, { recursive: true, force: true });
      await mkdir(directory, { recursive: true });
    }

    console.log("\nReset completed.");
    if (includeConfiguration) console.log(`Administrator: ${username}`);
    if (includeConfiguration && !process.env.ADMIN_PASSWORD)
      console.log(`Generated password: ${password}`);
  }
} catch (error) {
  if (!(error instanceof Error && error.message === "RESET_CANCELLED")) {
    console.error("Reset failed. Stop the application and check the database configuration.");
    process.exitCode = 1;
  }
} finally {
  rl.close();
  delete process.env.ADMIN_PASSWORD;
  await db.$disconnect();
}
