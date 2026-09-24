import "dotenv/config";
import { spawnSync } from "node:child_process";
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    "Set TEST_DATABASE_URL to a dedicated empty PostgreSQL test database. No database was modified.",
  );
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL };
const run = (args) => {
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(["run", "db:migrate"]);
run(["exec", "--", "tsx", "tests/postgres.integration.ts"]);
