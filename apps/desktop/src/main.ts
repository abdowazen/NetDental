import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as dotenv } from "dotenv";
let window: BrowserWindow | null = null;
let ownedApi: UtilityProcess | null = null;
let connecting = false;
let target = "";
let mode = "LOCAL";
let language: "en" | "fr" = "en";
let configValid = true;
let failure = false;
const fallbackFile = join(__dirname, "connection.html");
app.setName("NetDental");
// Keep the existing profile location so upgrades retain configuration and preferences.
app.setPath("userData", join(app.getPath("appData"), "Dental Clinic"));
const customUserData = app.commandLine.getSwitchValue("user-data-dir");
if (customUserData) app.setPath("userData", resolve(customUserData));
const languagePath = () => join(app.getPath("userData"), "language.json");
function isFallback(url: string) {
  return (
    url.startsWith("file:") &&
    decodeURIComponent(new URL(url).pathname)
      .replace(/^\//, "")
      .toLowerCase() === fallbackFile.replace(/\\/g, "/").toLowerCase()
  );
}
function localize() {
  return JSON.parse(
    readFileSync(join(__dirname, "locales", `${language}.json`), "utf8"),
  );
}
function publishState() {
  if (window && !window.isDestroyed() && isFallback(window.webContents.getURL())) {
    window.webContents.send("connection:update", { language, strings: localize(), failure });
  }
}
function startApi() {
  if (mode !== "LOCAL" || ownedApi) return;
  const runtime = app.isPackaged
    ? join(process.resourcesPath, "api")
    : resolve("apps/api");
  const entry = app.isPackaged
    ? join(runtime, "server.mjs")
    : join(runtime, "dist/server.js");
  const child = utilityProcess.fork(entry, [], {
    cwd: app.isPackaged ? runtime : process.cwd(),
    env: {
      ...process.env,
      WEB_DIST: app.isPackaged
        ? join(process.resourcesPath, "web")
        : resolve("apps/web/dist"),
    },
    stdio: "pipe",
  });
  ownedApi = child;
  child.stdout?.resume();
  child.stderr?.resume();
  // Intentionally do not pipe child logs containing operational details into renderer.
  child.on("exit", () => {
    if (ownedApi === child) ownedApi = null;
  });
}
async function ready() {
  const response = await fetch(`${target}/health`, {
    signal: AbortSignal.timeout(1500),
    redirect: "error",
  });
  const data = (await response.json()) as { status?: string };
  return response.ok && data.status === "ok";
}
async function connect() {
  if (connecting || !window) return;
  connecting = true;
  failure = false;
  publishState();
  if (configValid) {
    try {
      startApi();
      const deadline = Date.now() + 12000;
      do {
        try {
          if (await ready()) {
            await window.loadURL(target);
            connecting = false;
            return true;
          }
        } catch {
          /* bounded retry */
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
      } while (Date.now() < deadline);
    } catch {
      /* fallback is always available without API */
    }
  }
  connecting = false;
  failure = true;
  if (!isFallback(window.webContents.getURL()))
    await window.loadFile(fallbackFile);
  publishState();
  return false;
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.restore();
    window?.focus();
  });
  void app.whenReady().then(async () => {
    dotenv({
      path: app.isPackaged
        ? join(app.getPath("userData"), "desktop.env")
        : resolve(".env"),
    });
    try {
      if (existsSync(languagePath()))
        language =
          JSON.parse(readFileSync(languagePath(), "utf8")) === "fr"
            ? "fr"
            : "en";
      mode = process.env.DESKTOP_MODE ?? "LOCAL";
      const url = new URL(process.env.API_BASE_URL ?? "http://127.0.0.1:4310");
      const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(
        url.hostname,
      );
      if (
        !["LOCAL", "REMOTE"].includes(mode) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        !["https:", "http:"].includes(url.protocol) ||
        (url.protocol !== "https:" && !loopback) ||
        (mode === "LOCAL" && !loopback)
      )
        throw new Error("Invalid desktop configuration");
      target = url.origin;
      if (mode === "LOCAL") {
        process.env.HOST = url.hostname;
        process.env.PORT =
          url.port || (url.protocol === "https:" ? "443" : "80");
        process.env.APP_ORIGIN = target;
        if (url.protocol !== "http:")
          throw new Error("LOCAL uses loopback HTTP");
      }
    } catch {
      configValid = false;
    }
    window = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 850,
      minHeight: 620,
      show: false,
      backgroundColor: "#f5f8f7",
      title: "NetDental",
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    window.webContents.session.setPermissionRequestHandler(
      (_wc, _permission, callback) => callback(false),
    );
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.webContents.on("will-navigate", (event, url) => {
      if (!target || new URL(url).origin !== target) event.preventDefault();
    });
    window.webContents.on("will-redirect", (event, url) => {
      if (!target || new URL(url).origin !== target) event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        if (new URL(url).protocol === "https:") void shell.openExternal(url);
      } catch {
        /* invalid URL */
      }
      return { action: "deny" };
    });
    window.webContents.on(
      "did-fail-load",
      (_e, code, _desc, _url, mainFrame) => {
        if (mainFrame && code !== -3 && !connecting) {
          failure = true;
          void window?.loadFile(fallbackFile);
        }
      },
    );
    const allowed = (event: Electron.IpcMainInvokeEvent) =>
      event.sender === window?.webContents &&
      Boolean(event.senderFrame && isFallback(event.senderFrame.url));
    ipcMain.handle("connection:state", (event) => {
      if (!allowed(event)) throw new Error("Forbidden");
      return { language, strings: localize(), failure };
    });
    ipcMain.handle("connection:language", (event, value) => {
      if (!allowed(event) || !["en", "fr"].includes(value))
        throw new Error("Forbidden");
      language = value;
      writeFileSync(languagePath(), JSON.stringify(language));
      return { language, strings: localize(), failure };
    });
    ipcMain.handle("connection:retry", (event) => {
      if (!allowed(event)) throw new Error("Forbidden");
      return connect();
    });
    await window.loadFile(fallbackFile);
    window.maximize();
    window.show();
    void connect();
  });
  app.on("window-all-closed", () => app.quit());
  let quitting = false;
  app.on("before-quit", (event) => {
    const child = ownedApi;
    if (!child || quitting) return;
    event.preventDefault();
    quitting = true;
    const timeout = setTimeout(() => {
      child.kill();
      app.quit();
    }, 1500);
    child.once("exit", () => {
      clearTimeout(timeout);
      ownedApi = null;
      app.quit();
    });
    child.postMessage("shutdown");
  });
}
