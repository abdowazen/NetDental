import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
await build({
  entryPoints: ["src/main.ts", "src/preload.ts"],
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/connection.ts"],
  outfile: "dist/connection.cjs",
  bundle: true,
  platform: "browser",
  format: "iife",
});
await mkdir("dist/locales", { recursive: true });
await cp("../web/src/locales/en.json", "dist/locales/en.json");
await cp("../web/src/locales/fr.json", "dist/locales/fr.json");
await cp("src/connection.html", "dist/connection.html");
await cp("src/connection.css", "dist/connection.css");
await cp("src/assets", "dist/assets", { recursive: true });
