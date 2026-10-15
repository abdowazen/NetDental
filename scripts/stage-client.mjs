import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const target = ".runtime/workstation";
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp("apps/desktop/dist", `${target}/dist`, { recursive: true });
const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(`${target}/package.json`, JSON.stringify({
  name: "netdenty-workstation",
  productName: "NetDenty",
  version: rootPackage.version,
  description: "NetDenty clinic workstation",
  author: "NetDenty",
  main: "dist/main.cjs",
}));
