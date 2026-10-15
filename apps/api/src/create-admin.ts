import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";
import { usernameSchema } from "@clinic/shared";
import { passwordOptions } from "./app.js";

const db = new PrismaClient();

try {
  const username = usernameSchema.parse(
    process.env.ADMIN_USERNAME ?? "administrator",
  );
  const existing = await db.user.findUnique({ where: { username } });

  if (existing) {
    if (process.env.ADMIN_IF_MISSING === "true") {
      console.log(`Administrator already exists: ${username}`);
      process.exitCode = 0;
    } else {
      throw new Error("Administrator username already exists; no changes made.");
    }
  } else {
    const password =
      process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
    if (password.length < 12 || password.length > 128)
      throw new Error("Password must contain 12-128 characters.");

    await db.user.create({
      data: {
        username,
        displayName: "Administrator",
        role: "ADMIN",
        passwordHash: await hash(password, passwordOptions),
      },
    });
    console.log(`Administrator created: ${username}`);
    if (!process.env.ADMIN_PASSWORD)
      console.log(`Generated password: ${password}`);
  }
} catch (error) {
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : "Administrator creation failed; check the database and migrations.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
