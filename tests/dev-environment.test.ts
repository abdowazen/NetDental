import { describe, expect, it } from "vitest";
// @ts-expect-error Development launcher helper is plain JavaScript.
import { developmentEnvironment } from "../scripts/dev-environment.mjs";

describe("development API isolation", () => {
  it("keeps local desktop requests off the installed API and aligns origin and cookies", () => {
    const original = { PORT: "4310", API_BASE_URL: "http://127.0.0.1:4310", APP_ORIGIN: "https://clinic", COOKIE_SECURE: "true", ELECTRON_RUN_AS_NODE: "1" };
    expect(developmentEnvironment(original)).toMatchObject({ DESKTOP_MODE: "LOCAL", PORT: "4311", HOST: "127.0.0.1", API_BASE_URL: "http://127.0.0.1:4311", APP_ORIGIN: "http://127.0.0.1:4311", COOKIE_SECURE: "false" });
    expect(developmentEnvironment(original)).not.toHaveProperty("ELECTRON_RUN_AS_NODE");
    expect(original.PORT).toBe("4310");
  });
  it("supports an explicit development port and preserves remote mode", () => {
    expect(developmentEnvironment({ NETDENTY_DEV_PORT: "4411" }).PORT).toBe("4411");
    const remote = { DESKTOP_MODE: "REMOTE", API_BASE_URL: "https://clinic", COOKIE_SECURE: "true" };
    expect(developmentEnvironment(remote)).toEqual(remote);
  });
  it("rejects invalid ports and the installed server port", () => {
    for (const port of ["4310", "0", "65536", "abc", "4311.5"]) {
      expect(() => developmentEnvironment({ NETDENTY_DEV_PORT: port })).toThrow("NETDENTY_DEV_PORT");
    }
  });
});
