// Classify fixed patterns only. Never return the database error's raw message.
export function databaseFailure(error: { code?: unknown; errorCode?: unknown; message?: unknown }) {
  const reasons: Record<string, string> = {
    P1000: "authentication failed; check project database credentials",
    AUTHENTICATION_FAILED: "authentication failed; check project database credentials",
    P1001: "database server unreachable",
    P1002: "database server timed out",
    P1003: "database does not exist",
    P1010: "database access denied",
    P2021: "required table missing; apply migrations",
    P2022: "required column missing; apply migrations",
    MODULE_NOT_FOUND: "database runtime dependency missing",
  };
  const candidate = error?.code ?? error?.errorCode;
  const code = typeof candidate === "string" && (Object.hasOwn(reasons, candidate) || /^P[0-9]{4}$/.test(candidate))
    ? candidate
    : /authentication failed against database server/i.test(String(error?.message ?? "")) ? "AUTHENTICATION_FAILED" : "UNKNOWN";
  return `Database/schema check: FAIL [${code}] ${reasons[code] ?? "check configuration, database and migrations"}`;
}
