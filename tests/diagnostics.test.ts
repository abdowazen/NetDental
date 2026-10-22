import { describe, expect, it, vi } from "vitest";

vi.mock("node:util", () => ({ promisify: () => async () => ({ stdout: "Windows checks unavailable" }) }));
import { collectDiagnostics } from "../apps/desktop/src/diagnostics";
import { databaseFailure } from "../apps/desktop/src/database-failure";

const options = {
  target: "https://clinic", mode: "REMOTE", valid: true, packaged: true,
  apiRoot: ".", envFile: ".env", node: process.execPath, apiOwned: false, startupCode: null,
};
describe("connection diagnostic report", () => {
  it("recognizes Prisma authentication errors without a code and keeps secrets out", () => {
    const result = databaseFailure({ message: "Authentication failed against database server for SECRET" });
    expect(result).toContain("AUTHENTICATION_FAILED");
    expect(result).not.toContain("SECRET");
    expect(databaseFailure({ errorCode: "P1001" })).toContain("database server unreachable");
    expect(databaseFailure({ code: "SECRET" })).toContain("UNKNOWN");
  });
  it("checks health and HTML and explains server-only checks for workstations", async () => {
    const fetch = vi.fn(async (url: string) => new Response(url.endsWith("/health") ? '{"status":"ok"}' : '<html><script src="app.js"></script></html>'));
    const report = await collectDiagnostics({ ...options, fetch });
    expect(report).toContain("Configured API + database health: PASS");
    expect(report).toContain("Application HTML: PASS");
    expect(report).toContain("run the readiness script there");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not expose response bodies or exception messages when checks fail", async () => {
    const report = await collectDiagnostics({ ...options, fetch: async (url) => {
      if (url.endsWith("/health")) throw new Error("postgresql://clinic:SECRET@localhost/db");
      return new Response("Patient PRIVATE_DATA", { status: 500 });
    } });
    expect(report).toContain("Configured API + database health: FAIL");
    expect(report).toContain("Application HTML: FAIL");
    expect(report).not.toMatch(/SECRET|PRIVATE_DATA/);
  });
  it("does not contact an invalid origin or disclose embedded credentials", async () => {
    const fetch = vi.fn();
    const report = await collectDiagnostics({ ...options, valid: false, target: "https://user:SECRET@clinic", fetch });
    expect(fetch).not.toHaveBeenCalled();
    expect(report).not.toContain("SECRET");
    expect(report).toContain("Desktop configuration: FAIL");
  });
  it("reports API exit and missing local files independently of health failures", async () => {
    const report = await collectDiagnostics({ ...options, mode: "LOCAL", apiRoot: "does-not-exist", startupCode: 1,
      fetch: async () => { throw new Error("Offline"); } });
    expect(report).toContain("Last owned API exit: 1");
    expect(report).toContain("API entry file: FAIL");
    expect(report).toContain("Direct database check: unavailable");
  });
});
