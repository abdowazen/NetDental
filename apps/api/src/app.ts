import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { randomBytes, createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { hash, verify, argon2id } from "argon2";
import { ZodError } from "zod";
import {
  loginSchema,
  allowed,
  managedUserSchema,
  locationNameSchema,
  type Screen,
  type Action,
  preferencesSchema,
  patientSchema,
  procedureSchema,
  procedureSearchSchema,
  procedureStatusSchema,
  patientSearchSchema,
  patientIdSchema,
  currencySettingsSchema,
  exchangeRateSchema,
  clinicDate,
  selectExchangeRate,
  type ErrorCode,
  type User,
  dashboardPeriodSchema,
  newPatientReportQuerySchema,
  clientSystemLogSchema,
  systemLogQuerySchema,
} from "@clinic/shared";
import type { User as DbUser } from "@prisma/client";
import type { Config } from "./config.js";
import { databaseAccessError } from "./access.js";
import type { Store } from "./store.js";
import { registerOdontogram } from "./odontogram-routes.js";
import { registerPayments } from "./payment-routes.js";
import { registerLaboratory } from "./laboratory-routes.js";
import { registerPatientFiles } from "./patient-file-routes.js";
import { resolve } from "node:path";

export const passwordOptions = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const publicUser = (u: DbUser): User => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  preferredLanguage: u.preferredLanguage,
  createdAt: u.createdAt.toISOString(),
});
class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public statusCode: number,
  ) {
    super(code);
  }
}
export function requireRole(
  user: DbUser,
  allowed: string[] = ["DENTIST", "ASSISTANT", "RECEPTIONIST", "ADMIN"],
) {
  if (!allowed.includes(user.role)) throw new ApiError("FORBIDDEN", 403);
}

export async function buildApp(store: Store, config: Config) {
  const app = Fastify({
    logger: {
      level: "info",
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        'res.headers["set-cookie"]',
      ],
    },
    disableRequestLogging: true,
    bodyLimit: 8192,
    requestTimeout: 10000,
    trustProxy: false,
  });
  const cookieName = config.secure ? "__Host-clinic_session" : "clinic_session";
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: config.secure,
    sameSite: "strict" as const,
  };
  const dummyHash = await hash(
    randomBytes(32).toString("hex"),
    passwordOptions,
  );
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: config.secure ? [] : null,
      },
    },
    strictTransportSecurity: config.secure,
  });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => new ApiError("RATE_LIMITED", 429),
  });
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers.origin !== config.APP_ORIGIN ||
        req.headers["x-clinic-request"] !== "1")
    )
      throw new ApiError("FORBIDDEN", 403);
  });
  app.setErrorHandler(async (error, req, reply) => {
    if (error instanceof ApiError)
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code } });
    const accessError = databaseAccessError(error);
    if (accessError)
      return reply
        .status(
          accessError === "CONFLICT"
            ? 409
            : accessError === "NOT_FOUND"
              ? 404
              : 400,
        )
        .send({ error: { code: accessError } });
    const status = (error as { statusCode?: number }).statusCode;
    if (
      error instanceof ZodError ||
      status === 400 ||
      status === 413 ||
      status === 415
    )
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR" } });
    if (status === 429)
      return reply.status(429).send({ error: { code: "RATE_LIMITED" } });
    let userId: string | null = null;
    try {
      const token = req.cookies[cookieName];
      if (token && /^[a-f0-9]{64}$/.test(token))
        userId = (await store.findSession(digest(token)))?.userId ?? null;
    } catch {
      // Logging must never hide the original failure.
    }
    const rawCode = (error as { code?: unknown }).code;
    const rawName = (error as { name?: unknown }).name;
    const code = (typeof rawCode === "string" ? rawCode : typeof rawName === "string" ? rawName : "REQUEST_FAILED")
      .replace(/[^a-zA-Z0-9_.-]/g, "_")
      .slice(0, 80);
    await store.recordSystemLog?.({
      level: "error",
      source: "api",
      code,
      message: "Unexpected server error",
      method: req.method.slice(0, 10),
      path: req.url.split("?")[0].slice(0, 300),
      userId,
    }).catch(() => undefined);
    // Do not log raw exception messages: they may contain credentials or patient data.
    app.log.error({ code: "REQUEST_FAILED" }, "Request failed");
    return reply.status(503).send({ error: { code: "SERVICE_UNAVAILABLE" } });
  });
  async function authenticated(req: FastifyRequest) {
    const token = req.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new ApiError("UNAUTHORIZED", 401);
    const session = await store.findSession(digest(token));
    if (!session) throw new ApiError("UNAUTHORIZED", 401);
    if (session.expiresAt <= new Date() || !session.user.isActive) {
      await store.deleteSession(digest(token));
      throw new ApiError("UNAUTHORIZED", 401);
    }
    requireRole(session.user);
    return session.user;
  }
  async function userWithAccess(user: DbUser): Promise<User> {
    return {
      ...publicUser(user),
      access: await store.accessFor(user.id, user.role),
    };
  }
  async function scoped(req: FastifyRequest, screen: Screen, action: Action) {
    const user = await userWithAccess(await authenticated(req));
    if (!allowed(user, screen, action)) throw new ApiError("FORBIDDEN", 403);
    const raw = req.headers["x-clinic-room"];
    const roomId =
      typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : user.access!.rooms.length === 1
          ? user.access!.rooms[0].id
          : NaN;
    if (!Number.isSafeInteger(roomId))
      throw new ApiError("LOCATION_REQUIRED", 400);
    if (!user.access!.rooms.some((room) => room.id === roomId))
      throw new ApiError("FORBIDDEN", 403);
    return roomId;
  }
  async function administrator(req: FastifyRequest) {
    const user = await authenticated(req);
    requireRole(user, ["ADMIN"]);
    return user;
  }
  app.get("/api/admin/system-logs", async (req) => {
    await administrator(req);
    const input = systemLogQuerySchema.parse(req.query);
    return store.listSystemLogs?.(input) ?? { logs: [], total: 0 };
  });
  app.post(
    "/api/system-logs/client",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = await authenticated(req);
      const input = clientSystemLogSchema.parse(req.body);
      await store.recordSystemLog?.({
        level: "error",
        source: "client",
        code: input.code,
        message: input.message,
        method: "CLIENT",
        path: input.path,
        userId: user.id,
      });
      return reply.status(201).send({ recorded: true });
    },
  );
  app.get("/api/admin/users", async (req) => {
    await administrator(req);
    return { users: await store.listManagedUsers() };
  });
  app.post("/api/admin/users", { bodyLimit: 32768 }, async (req, reply) => {
    await administrator(req);
    const input = managedUserSchema.parse(req.body);
    if (!input.password) throw new ApiError("VALIDATION_ERROR", 400);
    const id = await store.saveManagedUser(
      null,
      input,
      await hash(input.password, passwordOptions),
    );
    return reply.status(201).send({ id });
  });
  app.put<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    { bodyLimit: 32768 },
    async (req) => {
      await administrator(req);
      const input = managedUserSchema.parse(req.body);
      return {
        id: await store.saveManagedUser(
          req.params.id,
          input,
          input.password
            ? await hash(input.password, passwordOptions)
            : undefined,
        ),
      };
    },
  );
  app.get("/api/admin/clinics", async (req) => {
    await administrator(req);
    return { clinics: await store.listClinics() };
  });
  app.post("/api/admin/clinics", async (req, reply) => {
    await administrator(req);
    await store.saveClinic(null, locationNameSchema.parse(req.body).name);
    return reply.status(201).send({ saved: true });
  });
  app.put<{ Params: { id: string } }>("/api/admin/clinics/:id", async (req) => {
    await administrator(req);
    await store.saveClinic(
      patientIdSchema.parse(req.params.id),
      locationNameSchema.parse(req.body).name,
    );
    return { saved: true };
  });
  app.post<{ Params: { id: string } }>(
    "/api/admin/clinics/:id/rooms",
    async (req, reply) => {
      await administrator(req);
      await store.saveRoom(
        null,
        patientIdSchema.parse(req.params.id),
        locationNameSchema.parse(req.body).name,
      );
      return reply.status(201).send({ saved: true });
    },
  );
  app.put<{ Params: { id: string; roomId: string } }>(
    "/api/admin/clinics/:id/rooms/:roomId",
    async (req) => {
      await administrator(req);
      await store.saveRoom(
        patientIdSchema.parse(req.params.roomId),
        patientIdSchema.parse(req.params.id),
        locationNameSchema.parse(req.body).name,
      );
      return { saved: true };
    },
  );
  app.get("/health", async () => {
    await store.health();
    return { status: "ok" };
  });
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const user = await store.findUser(input.username);
      const valid = await verify(
        user?.passwordHash ?? dummyHash,
        input.password,
      );
      if (!user || !valid || !user.isActive)
        throw new ApiError("INVALID_CREDENTIALS", 401);
      requireRole(user);
      await store.clearExpired();
      const previous = req.cookies[cookieName];
      if (previous) await store.deleteSession(digest(previous));
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + config.SESSION_HOURS * 3600000);
      await store.createSession({
        userId: user.id,
        tokenHash: digest(token),
        expiresAt: expires,
      });
      reply.setCookie(cookieName, token, { ...cookieOptions, expires });
      return { user: await userWithAccess(user) };
    },
  );
  app.get("/auth/me", async (req, reply) => {
    try {
      return { user: await userWithAccess(await authenticated(req)) };
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 401)
        reply.clearCookie(cookieName, cookieOptions);
      throw e;
    }
  });
  app.post("/auth/logout", async (req, reply) => {
    const token = req.cookies[cookieName];
    if (token) await store.deleteSession(digest(token));
    reply.clearCookie(cookieName, cookieOptions);
    return reply.status(204).send();
  });
  app.patch("/users/me/preferences", async (req) => {
    const user = await authenticated(req);
    const { preferredLanguage } = preferencesSchema.parse(req.body);
    return {
      user: await userWithAccess(
        await store.updateLanguage(user.id, preferredLanguage),
      ),
    };
  });
  registerOdontogram(app, store, async (req, action) => ({
    roomId: await scoped(req, "treatment", action),
    actorId: (await authenticated(req)).id,
  }));
  registerPayments(app, store, async (req, action) => ({
    roomId: await scoped(req, "payments", action),
    actorId: (await authenticated(req)).id,
  }));
  registerLaboratory(app, store, async (req, action) => ({
    roomId: await scoped(req, "treatment", action),
    actorId: (await authenticated(req)).id,
  }));
  registerPatientFiles(app, store, config.PATIENT_FILES_DIR ?? resolve("data/patient-files"), async (req, action) => ({
    roomId: await scoped(req, "treatment", action),
    actorId: (await authenticated(req)).id,
  }));
  app.get("/api/dashboard", async (req) => {
    const roomId = await scoped(req, "dashboard", "view");
    const period = dashboardPeriodSchema.parse((req.query as { period?: string }).period ?? "monthly");
    return store.getDashboard(roomId, period);
  });
  app.get("/api/reports/new-patients", async (req) => {
    const roomId = await scoped(req, "reportsListing", "view");
    return store.getNewPatientsReport(newPatientReportQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/procedures", async (req) => {
    const roomId = await scoped(req, "actsProcedures", "view");
    return store.searchProcedures(procedureSearchSchema.parse(req.query), roomId);
  });
  app.get<{ Params: { id: string } }>("/api/procedures/:id", async (req) => {
    const roomId = await scoped(req, "actsProcedures", "view");
    const procedure = await store.findProcedure(patientIdSchema.parse(req.params.id), roomId);
    if (!procedure) throw new ApiError("NOT_FOUND", 404);
    return { procedure };
  });
  app.post("/api/procedures", { bodyLimit: 32768 }, async (req, reply) => {
    const roomId = await scoped(req, "actsProcedures", "create");
    const procedure = await store.createProcedure(procedureSchema.parse(req.body), roomId);
    return reply.status(201).send({ procedure });
  });
  app.put<{ Params: { id: string } }>("/api/procedures/:id", { bodyLimit: 32768 }, async (req) => {
    const roomId = await scoped(req, "actsProcedures", "modify");
    const procedure = await store.updateProcedure(patientIdSchema.parse(req.params.id), procedureSchema.parse(req.body), roomId);
    if (!procedure) throw new ApiError("NOT_FOUND", 404);
    return { procedure };
  });
  app.patch<{ Params: { id: string } }>("/api/procedures/:id/status", async (req) => {
    const roomId = await scoped(req, "actsProcedures", "modify");
    const { active } = procedureStatusSchema.parse(req.body);
    const procedure = await store.setProcedureActive(patientIdSchema.parse(req.params.id), active, roomId);
    if (!procedure) throw new ApiError("NOT_FOUND", 404);
    return { procedure };
  });
  app.get("/api/patients", async (req) => {
    const roomId = await scoped(req, "patients", "view");
    const input = patientSearchSchema.parse(req.query);
    if (input.from && input.to && input.from > input.to)
      throw new ApiError("VALIDATION_ERROR", 400);
    return store.searchPatients(input, roomId);
  });
  app.get<{ Params: { id: string } }>("/api/patients/:id", async (req) => {
    const roomId = await scoped(req, "patients", "view");
    const patient = await store.findPatient(
      patientIdSchema.parse(req.params.id),
      roomId,
    );
    if (!patient) throw new ApiError("NOT_FOUND", 404);
    return { patient };
  });
  app.post("/api/patients", { bodyLimit: 32768 }, async (req, reply) => {
    const roomId = await scoped(req, "patients", "create");
    const patient = await store.createPatient(
      patientSchema.parse(req.body),
      roomId,
    );
    return reply.status(201).send({ patient });
  });
  app.put<{ Params: { id: string } }>(
    "/api/patients/:id",
    { bodyLimit: 32768 },
    async (req) => {
      const roomId = await scoped(req, "patients", "modify");
      const patient = await store.updatePatient(
        patientIdSchema.parse(req.params.id),
        patientSchema.parse(req.body),
        roomId,
      );
      if (!patient) throw new ApiError("NOT_FOUND", 404);
      return { patient };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/patients/:id",
    async (req, reply) => {
      const roomId = await scoped(req, "patients", "delete");
      if (
        !(await store.deletePatient(
          patientIdSchema.parse(req.params.id),
          roomId,
        ))
      )
        throw new ApiError("NOT_FOUND", 404);
      return reply.status(204).send();
    },
  );
  app.get("/currencies", async (req) => {
    const roomId = await scoped(req, "settings", "view");
    const today = clinicDate();
    const [baseCurrency, rates] = await Promise.all([
      store.getBaseCurrency(roomId),
      store.listExchangeRates(today.slice(0, 4), roomId),
    ]);
    return {
      baseCurrency,
      today,
      rates,
      effectiveRate: selectExchangeRate(rates, today),
    };
  });
  app.get("/api/base-currency", async (req) => {
    const user = await userWithAccess(await authenticated(req));
    const raw = req.headers["x-clinic-room"];
    const roomId =
      typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : user.access!.rooms.length === 1
          ? user.access!.rooms[0].id
          : NaN;
    if (!Number.isSafeInteger(roomId))
      throw new ApiError("LOCATION_REQUIRED", 400);
    if (!user.access!.rooms.some((room) => room.id === roomId))
      throw new ApiError("FORBIDDEN", 403);
    return { baseCurrency: await store.getBaseCurrency(roomId) };
  });
  app.patch("/currencies", async (req) => {
    const roomId = await scoped(req, "settings", "modify");
    const { baseCurrency } = currencySettingsSchema.parse(req.body);
    await store.setBaseCurrency(baseCurrency, roomId);
    return { baseCurrency };
  });
  app.put("/currencies/rates", async (req) => {
    const roomId = await scoped(req, "settings", "view");
    const rate = exchangeRateSchema.parse(req.body);
    if (rate.date > clinicDate()) throw new ApiError("VALIDATION_ERROR", 400);
    const existing = (
      await store.listExchangeRates(rate.date.slice(0, 4), roomId)
    ).some((r) => r.date === rate.date);
    await scoped(req, "settings", existing ? "modify" : "create");
    await store.saveExchangeRate(rate, roomId, !existing);
    return { rate };
  });
  const cleanup = setInterval(
    () => {
      void store
        .clearExpired()
        .catch(() => app.log.warn("Session cleanup unavailable"));
    },
    15 * 60 * 1000,
  );
  cleanup.unref();
  app.addHook("onClose", async () => {
    clearInterval(cleanup);
  });
  if (config.WEB_DIST && existsSync(config.WEB_DIST)) {
    await app.register(staticFiles, {
      root: config.WEB_DIST,
      prefix: "/",
      cacheControl: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.method === "GET" &&
        (["/", "/login", "/dashboard", "/settings", "/settings/general", "/settings/currency", "/settings/help", "/admin", "/admin/users", "/admin/locations", "/admin/logs", "/reports/new-patients", "/treatment"].includes(
          req.url.split("?")[0],
        ) ||
          /^\/(?:patients|procedures)(?:\/(?:new|\d+))?$/.test(req.url.split("?")[0]))
      )
        return reply.sendFile("index.html");
      return reply.status(404).send({ error: { code: "NOT_FOUND" } });
    });
  } else
    app.setNotFoundHandler((_req, reply) =>
      reply.status(404).send({ error: { code: "NOT_FOUND" } }),
    );
  return app;
}
