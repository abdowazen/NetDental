import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  shell,
  utilityProcess,
  type UtilityProcess,
} from "electron";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { config as dotenv } from "dotenv";
import { collectDiagnostics } from "./diagnostics";
let window: BrowserWindow | null = null;
let ownedApi: UtilityProcess | null = null;
let connecting = false;
let target = "";
let mode = "LOCAL";
let language: "en" | "fr" = "en";
let configValid = true;
let failure = false;
let lastApiExit: number | null = null;
let diagnosticBusy = false;
const fallbackFile = join(__dirname, "connection.html");
app.setName("NetDenty");
// Keep the existing profile location so upgrades retain configuration and preferences.
app.setPath("userData", join(app.getPath("appData"), "Dental Clinic"));
const customUserData = app.commandLine.getSwitchValue("user-data-dir");
if (customUserData) app.setPath("userData", resolve(customUserData));
const languagePath = () => join(app.getPath("userData"), "language.json");
const machineConfigPath = join(
  process.env.ProgramData ?? "C:\\ProgramData",
  "NetDenty",
  "desktop.env",
);
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
      PATIENT_FILES_DIR: join(app.getPath("userData"), "patient-files"),
    },
    stdio: "pipe",
  });
  ownedApi = child;
  child.stdout?.resume();
  child.stderr?.resume();
  // Intentionally do not pipe child logs containing operational details into renderer.
  child.on("exit", (code) => {
    lastApiExit = code;
    if (ownedApi === child) ownedApi = null;
  });
}
async function ready() {
  // Electron's network stack uses the operating-system certificate store.
  // Workstations trust the clinic's locally generated Caddy root certificate
  // during installation, while Node's built-in fetch may ignore that trust.
  const response = await net.fetch(`${target}/health`, {
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
    const userConfigPath = join(app.getPath("userData"), "desktop.env");
    dotenv({
      path: app.isPackaged
        ? existsSync(machineConfigPath)
          ? machineConfigPath
          : userConfigPath
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
      title: "NetDenty",
      icon: join(__dirname, "assets", "netdenty-mark.png"),
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
    const allowedApplication = (event: Electron.IpcMainInvokeEvent) => {
      if (event.sender !== window?.webContents || !event.senderFrame || !target) return false;
      try {
        return new URL(event.senderFrame.url).origin === target;
      } catch {
        return false;
      }
    };
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
    ipcMain.handle("connection:diagnostics", async (event) => {
      if (!allowed(event) && !allowedApplication(event)) throw new Error("Forbidden");
      if (diagnosticBusy) return { status: "busy" };
      diagnosticBusy = true;
      try {
        const report = await collectDiagnostics({
          target, mode, valid: configValid, packaged: app.isPackaged,
          apiRoot: app.isPackaged ? join(process.resourcesPath, "api") : resolve("apps/api"),
          envFile: app.isPackaged ? join(process.resourcesPath, "api/.env") : resolve(".env"),
          node: process.execPath, apiOwned: Boolean(ownedApi), startupCode: lastApiExit,
          fetch: (url) => net.fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" }),
        });
        const selection = await dialog.showSaveDialog(window!, {
          title: "Save NetDenty diagnostic log",
          defaultPath: `NetDenty-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`,
          filters: [{ name: "Diagnostic log", extensions: ["txt"] }],
        });
        if (selection.canceled || !selection.filePath) return { status: "cancelled" };
        writeFileSync(selection.filePath, report, "utf8");
        return { status: "saved" };
      } catch { return { status: "error" }; }
      finally { diagnosticBusy = false; }
    });
    ipcMain.handle("backup:save", async (event, bytes: Uint8Array, suggestedName: string) => {
      if (!allowedApplication(event) || !(bytes instanceof Uint8Array)) throw new Error("Forbidden");
      const safeName = /^[a-zA-Z0-9._-]{1,160}\.dump$/.test(suggestedName)
        ? suggestedName
        : "NetDenty-backup.dump";
      const selection = await dialog.showSaveDialog(window!, {
        title: "Save NetDenty backup",
        defaultPath: safeName,
        filters: [{ name: "NetDenty PostgreSQL backup", extensions: ["dump"] }],
      });
      if (selection.canceled || !selection.filePath) return { saved: false };
      writeFileSync(selection.filePath, Buffer.from(bytes));
      return { saved: true };
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
