export function developmentEnvironment(source) {
  const env = { ...source };
  delete env.ELECTRON_RUN_AS_NODE;
  if ((env.DESKTOP_MODE ?? "LOCAL") === "LOCAL") {
    const port = Number(env.NETDENTY_DEV_PORT ?? "4311");
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 4310) {
      throw new Error("NETDENTY_DEV_PORT must be 1024-65535 and different from the installed server port 4310.");
    }
    env.DESKTOP_MODE = "LOCAL";
    env.HOST = "127.0.0.1";
    env.PORT = String(port);
    env.API_BASE_URL = `http://127.0.0.1:${port}`;
    env.APP_ORIGIN = env.API_BASE_URL;
    env.COOKIE_SECURE = "false";
  }
  return env;
}
