import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await mkdir(".runtime/api", { recursive: true });
await mkdir(".runtime/desktop", { recursive: true });
const apiPackage = JSON.parse(await readFile("apps/api/package.json", "utf8"));
const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
const dependencies = Object.fromEntries(
  Object.entries(apiPackage.dependencies).filter(
    ([name]) => name !== "@clinic/shared",
  ),
);
await build({
  entryPoints: ["apps/api/src/server.ts"],
  outfile: ".runtime/api/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  external: Object.keys(dependencies),
  target: "node22",
});
const manifest = {
  name: "clinic-api-runtime",
  version: "0.1.0",
  private: true,
  type: "module",
  dependencies,
  overrides: rootPackage.overrides,
};
await writeFile(".runtime/api/package.json", JSON.stringify(manifest));
// Preserve the exact root lock resolutions, omitting development and workspace packages.
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
lock.name = manifest.name;
lock.packages[""] = manifest;
for (const [path, entry] of Object.entries(lock.packages)) {
  if (path && (!path.startsWith("node_modules/") || entry.link))
    delete lock.packages[path];
}
await writeFile(".runtime/api/package-lock.json", JSON.stringify(lock));
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["ci", "--omit=dev", "--no-audit", "--no-fund"],
  {
    cwd: ".runtime/api",
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (result.status !== 0) process.exit(result.status ?? 1);
await cp("node_modules/.prisma", ".runtime/api/node_modules/.prisma", {
  recursive: true,
});
await cp("apps/desktop/dist", ".runtime/desktop/dist", { recursive: true });
await writeFile(
  ".runtime/desktop/package.json",
  JSON.stringify({
    name: "netdental",
    productName: "NetDental",
    version: "0.1.0",
    description: "NetDental desktop workspace",
    author: "NetDental",
    main: "dist/main.cjs",
  }),
);
