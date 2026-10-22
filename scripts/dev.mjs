import { spawn } from "node:child_process";
import { resolve } from "node:path";
import electron from "electron";
import "dotenv/config";
import { developmentEnvironment } from "./dev-environment.mjs";
const env = developmentEnvironment(process.env);
const child = spawn(electron, ["apps/desktop/dist/main.cjs", `--user-data-dir=${resolve(".runtime/dev-profile")}`], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code ?? 1));
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
