import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { prismaStore } from "./store.js";
const db = new PrismaClient();
try {
  const config = readConfig();
  config.WEB_DIST ??= resolve("apps/web/dist");
  const app = await buildApp(prismaStore(db), config);
  let closing = false;
  const stop = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  // ParentPort exists only when Electron owns this utility process.
  (
    process as NodeJS.Process & {
      parentPort?: { on: (name: string, fn: () => void) => void };
    }
  ).parentPort?.on("message", () => void stop());
  await app.listen({ host: config.HOST, port: config.PORT });
} catch {
  console.error(
    "API startup failed. Check configuration, port availability and deployment.",
  );
  await db.$disconnect();
  process.exit(1);
}
