import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { chromium } from "playwright";
import {
  applyAppearance,
  readAppearance,
  saveAppearance,
  themeColors,
  type Appearance,
  type ThemeColor,
} from "../apps/web/src/lib/appearance.js";

const values = new Map<string, string>();
const dataset: Record<string, string> = {};
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
});
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { documentElement: { dataset } },
});

const storageKey = "clinic.appearance";
const legacy: Record<string, ThemeColor> = {
  default: "clinical-teal",
  blue: "dental-blue",
  orange: "warm-amber",
  purple: "soft-violet",
  "aqua-blue": "ocean-cyan",
  "aqua-green": "fresh-emerald",
};

for (const [oldColor, color] of Object.entries(legacy)) {
  values.set(storageKey, JSON.stringify({ color: oldColor, mode: "dark" }));
  assert.deepEqual(readAppearance(), { color, mode: "dark" });
  assert.equal(
    values.get(storageKey),
    JSON.stringify({ color, mode: "dark" }),
  );
}

values.set(storageKey, JSON.stringify({ color: "unknown", mode: "dark" }));
assert.deepEqual(readAppearance(), {
  color: "clinical-teal",
  mode: "light",
});
values.delete(storageKey);
assert.deepEqual(readAppearance(), {
  color: "clinical-teal",
  mode: "light",
});

for (const color of themeColors) {
  for (const mode of ["light", "dark"] as const) {
    const appearance: Appearance = { color, mode };
    assert.equal(saveAppearance(appearance), true);
    assert.deepEqual(readAppearance(), appearance);
    assert.deepEqual(dataset, appearance);
    applyAppearance(appearance);
  }
}

const presets: Record<
  ThemeColor,
  { primary: string; hover: string; selected: string; darkSelected: string; darkInk: string }
> = {
  "clinical-teal": { primary: "15 118 110", hover: "17 94 89", selected: "204 251 241", darkSelected: "19 78 74", darkInk: "94 234 212" },
  "dental-blue": { primary: "37 99 235", hover: "29 78 216", selected: "219 234 254", darkSelected: "23 37 84", darkInk: "147 197 253" },
  "warm-amber": { primary: "180 83 9", hover: "146 64 14", selected: "254 243 199", darkSelected: "69 26 3", darkInk: "252 211 77" },
  "soft-violet": { primary: "124 58 237", hover: "109 40 217", selected: "237 233 254", darkSelected: "46 16 101", darkInk: "196 181 253" },
  "ocean-cyan": { primary: "14 116 144", hover: "21 94 117", selected: "207 250 254", darkSelected: "8 51 68", darkInk: "103 232 249" },
  "fresh-emerald": { primary: "4 120 87", hover: "6 95 70", selected: "209 250 229", darkSelected: "2 44 34", darkInk: "110 231 183" },
};

function rgb(value: string) {
  return `rgb(${value.split(" ").join(", ")})`;
}
function luminance(value: string) {
  const channels = value.split(" ").map(Number).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(first: string, second: string) {
  const left = luminance(first);
  const right = luminance(second);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

const assets = await readdir("apps/web/dist/assets");
const cssName = assets.find((name) => name.startsWith("index-") && name.endsWith(".css"));
assert(cssName, "Built web CSS was not found. Run the web build first.");
const css = await readFile(`apps/web/dist/assets/${cssName}`, "utf8");
const selectorSource = await readFile(
  "apps/web/src/features/settings/AppearanceSettings.tsx",
  "utf8",
);
const styleSource = await readFile("apps/web/src/styles.css", "utf8");
const indexSource = await readFile("apps/web/index.html", "utf8");
const bootstrapSource = await readFile(
  "apps/web/public/appearance-bootstrap.js",
  "utf8",
);
assert.match(selectorSource, /<fieldset/);
assert.match(selectorSource, /type="radio"/);
assert.match(selectorSource, /grid-cols-1.*sm:grid-cols-2.*lg:grid-cols-3/);
assert.match(styleSource, /peer-focus-visible/);
assert(
  indexSource.indexOf("/appearance-bootstrap.js") <
    indexSource.indexOf("/src/main.tsx"),
  "Appearance bootstrap must run before the application module.",
);

const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const startupPage = await browser.newPage();
  await startupPage.addInitScript((appearance) => {
    localStorage.setItem("clinic.appearance", JSON.stringify(appearance));
  }, { color: "aqua-blue", mode: "dark" });
  await startupPage.route("http://appearance.test/", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><script>${bootstrapSource}</script><script>window.bootstrapSnapshot = { ...document.documentElement.dataset };</script></head><body></body></html>`,
    });
  });
  await startupPage.goto("http://appearance.test/");
  assert.deepEqual(
    await startupPage.evaluate(
      () => (window as Window & { bootstrapSnapshot: Record<string, string> }).bootstrapSnapshot,
    ),
    { color: "ocean-cyan", mode: "dark" },
  );
  await startupPage.close();

  const page = await browser.newPage();
  await page.setContent(`<!doctype html><html><head><style>${css}</style></head><body><div class="flex">
    <aside id="sidebar" class="sidebar w-64"><a id="nav" class="nav-item active">Active</a></aside>
    <main class="flex-1 p-8">
      <button id="button" class="button">Save</button>
      <input id="input" class="input" value="Value">
      <input id="checkbox" type="checkbox" checked>
      <button id="switch" role="switch" aria-checked="true">On</button>
      <article id="card" class="card">Card</article>
      <div id="dialog" class="border border-line bg-surface text-ink">Dialog</div>
      <a id="link" class="text-accent-ink" href="#">Link</a>
      <button id="tab" class="border-b-2 border-accent-solid text-accent-ink">Tab</button>
      <label><input class="peer sr-only" type="radio" checked><span id="selected" class="appearance-option">Selected</span></label>
    </main>
  </div></body></html>`);

  for (const color of themeColors) {
    const preset = presets[color];
    assert(contrast(preset.primary, "255 255 255") >= 4.5, `${color} primary button contrast`);
    for (const mode of ["light", "dark"] as const) {
      await page.mouse.move(10, 500);
      await page.waitForTimeout(200);
      await page.evaluate(({ color, mode }) => {
        document.documentElement.dataset.color = color;
        document.documentElement.dataset.mode = mode;
      }, { color, mode });
      await page.waitForTimeout(200);
      const styles = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const card = getComputedStyle(document.getElementById("card")!);
        const dialog = getComputedStyle(document.getElementById("dialog")!);
        const input = getComputedStyle(document.getElementById("input")!);
        const button = getComputedStyle(document.getElementById("button")!);
        const selected = getComputedStyle(document.getElementById("selected")!);
        const link = getComputedStyle(document.getElementById("link")!);
        const tab = getComputedStyle(document.getElementById("tab")!);
        const checkbox = getComputedStyle(document.getElementById("checkbox")!);
        const toggle = getComputedStyle(document.getElementById("switch")!);
        const sidebar = getComputedStyle(document.getElementById("sidebar")!);
        const nav = getComputedStyle(document.getElementById("nav")!);
        return {
          primary: root.getPropertyValue("--accent-solid").trim(),
          hover: root.getPropertyValue("--accent-hover").trim(),
          soft: root.getPropertyValue("--accent-soft").trim(),
          inkToken: root.getPropertyValue("--accent-ink").trim(),
          bodyBackground: getComputedStyle(document.body).backgroundColor,
          bodyColor: getComputedStyle(document.body).color,
          cardBackground: card.backgroundColor,
          dialogBackground: dialog.backgroundColor,
          inputBackground: input.backgroundColor,
          buttonBackground: button.backgroundColor,
          buttonColor: button.color,
          selectedBackground: selected.backgroundColor,
          selectedBorder: selected.borderColor,
          linkColor: link.color,
          tabBorder: tab.borderBottomColor,
          checkboxAccent: checkbox.accentColor,
          switchBackground: toggle.backgroundColor,
          sidebarBackground: sidebar.backgroundColor,
          navBackground: nav.backgroundColor,
        };
      });
      const surface = mode === "light" ? "255 255 255" : "30 41 59";
      const canvas = mode === "light" ? "248 250 252" : "15 23 42";
      const ink = mode === "light" ? "15 23 42" : "248 250 252";
      const accentInk = mode === "light" ? preset.primary : preset.darkInk;
      assert.equal(styles.primary, preset.primary);
      assert.equal(styles.hover, preset.hover);
      assert.equal(styles.soft, mode === "light" ? preset.selected : preset.darkSelected);
      assert.equal(styles.inkToken, accentInk);
      assert.equal(styles.bodyBackground, rgb(canvas));
      assert.equal(styles.bodyColor, rgb(ink));
      assert.equal(styles.cardBackground, rgb(surface));
      assert.equal(styles.dialogBackground, rgb(surface));
      assert.equal(styles.inputBackground, rgb(mode === "light" ? "255 255 255" : "15 23 42"));
      assert.equal(styles.buttonBackground, rgb(preset.primary));
      assert.equal(styles.buttonColor, "rgb(255, 255, 255)");
      assert.equal(styles.selectedBackground, rgb(mode === "light" ? preset.selected : preset.darkSelected));
      assert.equal(styles.selectedBorder, rgb(preset.primary));
      assert.equal(styles.linkColor, rgb(accentInk));
      assert.equal(styles.tabBorder, rgb(preset.primary));
      assert.equal(styles.checkboxAccent, rgb(preset.primary));
      assert.equal(styles.switchBackground, rgb(preset.primary));
      assert.equal(styles.sidebarBackground, rgb(mode === "light" ? preset.primary : surface));
      if (mode === "dark") assert.equal(styles.navBackground, rgb(preset.primary));
      assert(contrast(accentInk, surface) >= 4.5, `${color} ${mode} themed text contrast`);

      await page.hover("#button");
      await page.waitForTimeout(200);
      assert.equal(
        await page.locator("#button").evaluate((element) => getComputedStyle(element).backgroundColor),
        rgb(preset.hover),
      );
      await page.focus("#input");
      assert.equal(
        await page.locator("#input").evaluate((element) => getComputedStyle(element).borderColor),
        rgb(accentInk),
      );
    }
  }
} finally {
  await browser.close();
}

console.log("Appearance checks passed for six presets in light and dark modes.");
