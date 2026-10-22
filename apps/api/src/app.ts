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
  canUseDefaultPage,
  defaultPageSchema,
  managedUserSchema,
  locationNameSchema,
  type Screen,
  type Action,
  preferencesSchema,
  patientSchema,
  procedureSchema,
  procedureSearchSchema,
  procedureStatusSchema,
  laboratoryCatalogSchema,
  laboratoryCatalogSearchSchema,
  laboratoryCatalogStatusSchema,
  laboratoryRateSchema,
  billCategorySchema,
  billCategorySearchSchema,
  billCategoryStatusSchema,
  billExpenseSchema,
  billExpenseSearchSchema,
  supplyItemSchema,
  supplyItemSearchSchema,
  inventoryOptionSearchSchema,
  supplierSchema,
  supplierSearchSchema,
  supplierStatusSchema,
  purchaseInvoiceSchema,
  purchaseInvoiceSearchSchema,
  labStatementQuerySchema,
  patientStatementQuerySchema,
  completedBalancesQuerySchema,
  billingAnalyticsQuerySchema,
  inventoryAnalyticsQuerySchema,
  patientSearchSchema,
  patientIdSchema,
  currencySettingsSchema,
  exchangeRateSchema,
  rateDateSchema,
  clinicDate,
  selectExchangeRate,
  type ErrorCode,
  type User,
  dashboardQuerySchema,
  newPatientReportQuerySchema,
  clientSystemLogSchema,
  systemLogQuerySchema,
  systemLogClearSchema,
  systemLogIdSchema,
  appointmentInputSchema,
  appointmentQuerySchema,
  appointmentStatusInputSchema,
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
import { DatabaseBackupError, registerDatabaseBackup } from "./database-backup.js";
import { AppointmentOverlapError } from "./appointments.js";

export const passwordOptions = {
  type: argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function sanitizeTechnicalText(value: unknown, limit: number) {
  const raw = typeof value === "string" ? value : String(value ?? "");
  return raw
    .replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, "[redacted-database-url]")
    .replace(/(authorization|cookie|password|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
    .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]+/gi, "$1?[redacted]")
    .replace(/\0/g, "")
    .slice(0, limit);
}
function technicalError(error: unknown) {
  const record = error as { name?: unknown; code?: unknown; message?: unknown; stack?: unknown; technicalDetails?: unknown };
  const name = sanitizeTechnicalText(typeof record.name === "string" ? record.name : "Error", 100);
  const code = sanitizeTechnicalText(typeof record.code === "string" ? record.code : name || "REQUEST_FAILED", 80)
    .replace(/[^a-zA-Z0-9_.-]/g, "_") || "REQUEST_FAILED";
  const message = sanitizeTechnicalText(typeof record.message === "string" ? record.message : "Unexpected server error", 500) || "Unexpected server error";
  const frames = typeof record.stack === "string"
    ? record.stack.split(/\r?\n/).slice(1).filter((line) => /^\s*at\s/.test(line)).slice(0, 8).map((line) => sanitizeTechnicalText(line.trim(), 350))
    : [];
  const suppliedDetails = typeof record.technicalDetails === "string" ? sanitizeTechnicalText(record.technicalDetails, 3000) : "";
  const details = [`Error name: ${name}`, `Error code: ${code}`, `Technical message: ${message}`, ...(suppliedDetails ? ["Tool output:", suppliedDetails] : []), ...(frames.length ? ["Stack frames:", ...frames] : [])].join("\n").slice(0, 4000);
  return { code, message, details };
}
export const publicUser = (u: DbUser): User => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  role: u.role,
  preferredLanguage: u.preferredLanguage,
  defaultPage: defaultPageSchema.parse(u.defaultPage),
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
    if (error instanceof AppointmentOverlapError)
      return reply.status(409).send({ error: { code: "CONFLICT" } });
    if (error instanceof DatabaseBackupError && ["BACKUP_BUSY", "INVALID_BACKUP_FILE"].includes(error.code))
      return reply.status(error.code === "BACKUP_BUSY" ? 409 : 400).send({ error: { code: error.code } });
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
    const technical = technicalError(error);
    await store.recordSystemLog?.({
      level: "error",
      source: "api",
      code: technical.code,
      message: technical.message,
      details: technical.details,
      requestId: String(req.id).slice(0, 100),
      method: req.method.slice(0, 10),
      path: req.url.split("?")[0].slice(0, 300),
      userId,
    }).catch(() => undefined);
    app.log.error({ code: technical.code, requestId: req.id }, "Request failed");
    if (error instanceof DatabaseBackupError)
      return reply.status(503).send({ error: { code: error.code } });
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
    const user = await authorized(req, screen, action);
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
  async function authorized(req: FastifyRequest, screen: Screen, action: Action) {
    const user = await userWithAccess(await authenticated(req));
    if (!allowed(user, screen, action)) throw new ApiError("FORBIDDEN", 403);
    return user;
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
  app.delete<{ Params: { id: string } }>("/api/admin/system-logs/:id", async (req, reply) => {
    await administrator(req);
    if (!(await store.deleteSystemLog?.(systemLogIdSchema.parse(req.params.id)))) throw new ApiError("NOT_FOUND", 404);
    return reply.status(204).send();
  });
  app.delete("/api/admin/system-logs", async (req) => {
    await administrator(req);
    const { source } = systemLogClearSchema.parse(req.query);
    return { deleted: await store.clearSystemLogs?.(source) ?? 0 };
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
        details: sanitizeTechnicalText(input.details, 4000),
        requestId: String(req.id).slice(0, 100),
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
    const preferences = preferencesSchema.parse(req.body);
    if (
      preferences.defaultPage &&
      !canUseDefaultPage(
        await userWithAccess(user),
        preferences.defaultPage,
      )
    )
      throw new ApiError("FORBIDDEN", 403);
    return {
      user: await userWithAccess(
        await store.updatePreferences(user.id, preferences),
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
    return store.getDashboard(roomId, dashboardQuerySchema.parse(req.query));
  });
  app.get("/api/appointments", async (req) => {
    const roomId = await scoped(req, "appointments", "view");
    return store.getAppointments(roomId, appointmentQuerySchema.parse(req.query));
  });
  app.get("/api/appointments/patients", async (req) => {
    const roomId = await scoped(req, "appointments", "view");
    return store.searchPatients(patientSearchSchema.parse(req.query), roomId);
  });
  app.get<{ Params: { id: string } }>("/api/appointments/:id", async (req) => {
    const roomId = await scoped(req, "appointments", "view");
    const appointment = await store.findAppointment(req.params.id, roomId);
    if (!appointment) throw new ApiError("NOT_FOUND", 404);
    return { appointment };
  });
  app.post("/api/appointments", async (req, reply) => {
    const roomId = await scoped(req, "appointments", "create");
    const actor = await authenticated(req);
    return reply.status(201).send({ appointment: await store.createAppointment(appointmentInputSchema.parse(req.body), roomId, actor.id) });
  });
  app.put<{ Params: { id: string } }>("/api/appointments/:id", async (req) => {
    const roomId = await scoped(req, "appointments", "modify");
    const actor = await authenticated(req);
    const appointment = await store.updateAppointment(req.params.id, appointmentInputSchema.parse(req.body), roomId, actor.id);
    if (!appointment) throw new ApiError("NOT_FOUND", 404);
    return { appointment };
  });
  app.patch<{ Params: { id: string } }>("/api/appointments/:id/status", async (req) => {
    const roomId = await scoped(req, "appointments", "modify");
    const actor = await authenticated(req);
    const appointment = await store.setAppointmentStatus(req.params.id, appointmentStatusInputSchema.parse(req.body).status, roomId, actor.id);
    if (!appointment) throw new ApiError("NOT_FOUND", 404);
    return { appointment };
  });
  app.delete<{ Params: { id: string } }>("/api/appointments/:id", async (req, reply) => {
    const roomId = await scoped(req, "appointments", "delete");
    if (!await store.deleteAppointment(req.params.id, roomId)) throw new ApiError("NOT_FOUND", 404);
    return reply.status(204).send();
  });
  app.get("/api/reports/new-patients", async (req) => {
    const roomId = await scoped(req, "reportNewPatients", "view");
    return store.getNewPatientsReport(newPatientReportQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/reports/lab-statement", async (req) => {
    const roomId = await scoped(req, "reportLabStatement", "view");
    return store.getLabStatement(labStatementQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/reports/lab-statement-laboratories", async (req) => {
    const roomId = await scoped(req, "reportLabStatement", "view");
    return store.searchLaboratories(laboratoryCatalogSearchSchema.parse(req.query), roomId);
  });
  app.get("/api/reports/patients-statement", async (req) => {
    const roomId = await scoped(req, "reportPatientsStatement", "view");
    return store.getPatientStatement(patientStatementQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/reports/completed-balances", async (req) => {
    const roomId = await scoped(req, "reportCompletedBalances", "view");
    return store.getCompletedBalances(completedBalancesQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/reports/billing-payments", async (req) => {
    const roomId = await scoped(req, "reportBillingPayments", "view");
    return store.getBillingAnalytics(billingAnalyticsQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/reports/inventory", async (req) => {
    const roomId = await scoped(req, "reportInventoryAnalytics", "view");
    return store.getInventoryAnalytics(inventoryAnalyticsQuerySchema.parse(req.query), roomId);
  });
  app.get("/api/procedures", async (req) => {
    const roomId = await scoped(req, "actsProcedures", "view");
    return store.searchProcedures(procedureSearchSchema.parse(req.query), roomId);
  });
  app.get("/api/bill-categories", async (req) => {
    const roomId = await scoped(req, "billsCategories", "view");
    return store.searchBillCategories(billCategorySearchSchema.parse(req.query), roomId);
  });
  app.get("/api/supplies", async (req) => {
    const roomId = await scoped(req, "suppliesMaterials", "view");
    return store.searchSupplyItems(supplyItemSearchSchema.parse(req.query), roomId);
  });
  app.get("/api/purchase-invoices", async (req) => {
    const roomId = await scoped(req, "purchaseInvoice", "view");
    return store.searchPurchaseInvoices(purchaseInvoiceSearchSchema.parse(req.query), roomId);
  });
  app.get("/api/purchase-invoices/suppliers", async (req) => {
    const roomId = await scoped(req, "purchaseInvoice", "view"); const { q } = inventoryOptionSearchSchema.parse(req.query);
    return store.searchSupplierOptions(q, roomId);
  });
  app.get("/api/purchase-invoices/products", async (req) => {
    const roomId = await scoped(req, "purchaseInvoice", "view");
    const query = req.query as { supplierId?: unknown; date?: unknown };
    const supplierId = patientIdSchema.parse(query.supplierId);
    const date = rateDateSchema.parse(query.date);
    return store.purchaseProducts(supplierId, roomId, date);
  });
  app.get<{ Params: { id: string } }>("/api/purchase-invoices/:id", async (req) => {
    const roomId = await scoped(req, "purchaseInvoice", "view"); const invoice = await store.findPurchaseInvoice(patientIdSchema.parse(req.params.id), roomId);
    if (!invoice) throw new ApiError("NOT_FOUND", 404); return { invoice };
  });
  app.post("/api/purchase-invoices", { bodyLimit: 65536 }, async (req, reply) => {
    const roomId = await scoped(req, "purchaseInvoice", "create"); const actorId = (await authenticated(req)).id;
    return reply.status(201).send({ invoice: await store.createPurchaseInvoice(purchaseInvoiceSchema.parse(req.body), roomId, actorId) });
  });
  app.put<{ Params: { id: string } }>("/api/purchase-invoices/:id", { bodyLimit: 65536 }, async (req) => {
    const roomId = await scoped(req, "purchaseInvoice", "modify"); const invoice = await store.updatePurchaseInvoice(patientIdSchema.parse(req.params.id), purchaseInvoiceSchema.parse(req.body), roomId);
    if (!invoice) throw new ApiError("NOT_FOUND", 404); return { invoice };
  });
  app.delete<{ Params: { id: string } }>("/api/purchase-invoices/:id", async (req, reply) => {
    const roomId = await scoped(req, "purchaseInvoice", "delete");
    if (!(await store.deletePurchaseInvoice(patientIdSchema.parse(req.params.id), roomId))) throw new ApiError("NOT_FOUND", 404);
    return reply.status(204).send();
  });
  app.get("/api/suppliers", async (req) => {
    const roomId = await scoped(req, "suppliersVendors", "view");
    return store.searchSuppliers(supplierSearchSchema.parse(req.query), roomId);
  });
  app.get<{ Params: { id: string } }>("/api/suppliers/:id", async (req) => {
    const roomId = await scoped(req, "suppliersVendors", "view");
    const supplier = await store.findSupplier(patientIdSchema.parse(req.params.id), roomId);
    if (!supplier) throw new ApiError("NOT_FOUND", 404); return { supplier };
  });
  app.post("/api/suppliers", { bodyLimit: 16384 }, async (req, reply) => {
    const roomId = await scoped(req, "suppliersVendors", "create");
    return reply.status(201).send({ supplier: await store.createSupplier(supplierSchema.parse(req.body), roomId) });
  });
  app.put<{ Params: { id: string } }>("/api/suppliers/:id", { bodyLimit: 16384 }, async (req) => {
    const roomId = await scoped(req, "suppliersVendors", "modify");
    const supplier = await store.updateSupplier(patientIdSchema.parse(req.params.id), supplierSchema.parse(req.body), roomId);
    if (!supplier) throw new ApiError("NOT_FOUND", 404); return { supplier };
  });
  app.patch<{ Params: { id: string } }>("/api/suppliers/:id/status", async (req) => {
    const roomId = await scoped(req, "suppliersVendors", "modify");
    const { active } = supplierStatusSchema.parse(req.body);
    const supplier = await store.setSupplierActive(patientIdSchema.parse(req.params.id), active, roomId);
    if (!supplier) throw new ApiError("NOT_FOUND", 404); return { supplier };
  });
  app.get("/api/supplies/brands", async (req) => {
    const roomId = await scoped(req, "suppliesMaterials", "view");
    const { q } = inventoryOptionSearchSchema.parse(req.query);
    return store.searchBrandOptions(q, roomId);
  });
  app.get("/api/supplies/units", async (req) => {
    await scoped(req, "suppliesMaterials", "view");
    return store.listUnits();
  });
  app.get("/api/supplies/products", async (req) => {
    const roomId = await scoped(req, "suppliesMaterials", "view");
    const { q } = inventoryOptionSearchSchema.parse(req.query);
    return store.searchProductOptions(q, roomId);
  });
  app.get("/api/supplies/suppliers", async (req) => {
    const roomId = await scoped(req, "suppliesMaterials", "view");
    const { q } = inventoryOptionSearchSchema.parse(req.query);
    return store.searchSupplierOptions(q, roomId);
  });
  app.get<{ Params: { id: string } }>("/api/supplies/:id", async (req) => {
    const roomId = await scoped(req, "suppliesMaterials", "view");
    const item = await store.findSupplyItem(patientIdSchema.parse(req.params.id), roomId);
    if (!item) throw new ApiError("NOT_FOUND", 404); return { item };
  });
  app.post("/api/supplies", { bodyLimit: 16384 }, async (req, reply) => {
    const roomId = await scoped(req, "suppliesMaterials", "create");
    return reply.status(201).send({ item: await store.createSupplyItem(supplyItemSchema.parse(req.body), roomId) });
  });
  app.put<{ Params: { id: string } }>("/api/supplies/:id", { bodyLimit: 16384 }, async (req) => {
    const roomId = await scoped(req, "suppliesMaterials", "modify");
    const item = await store.updateSupplyItem(patientIdSchema.parse(req.params.id), supplyItemSchema.parse(req.body), roomId);
    if (!item) throw new ApiError("NOT_FOUND", 404); return { item };
  });
  app.delete<{ Params: { id: string } }>("/api/supplies/:id", async (req, reply) => {
    const roomId = await scoped(req, "suppliesMaterials", "delete");
    if (!(await store.deleteSupplyItem(patientIdSchema.parse(req.params.id), roomId))) throw new ApiError("NOT_FOUND", 404);
    return reply.status(204).send();
  });
  app.get("/api/bill-expenses", async (req) => {
    const roomId = await scoped(req, "billsPayments", "view");
    return store.searchBillExpenses(billExpenseSearchSchema.parse(req.query), roomId);
  });
  app.get("/api/bill-expense-laboratories", async (req) => {
    const roomId = await scoped(req, "billsPayments", "view");
    return store.searchLaboratories(laboratoryCatalogSearchSchema.parse(req.query), roomId);
  });
  app.get<{ Params: { id: string } }>("/api/bill-expenses/:id", async (req) => {
    const roomId = await scoped(req, "billsPayments", "view");
    const expense = await store.findBillExpense(req.params.id, roomId);
    if (!expense) throw new ApiError("NOT_FOUND", 404); return { expense };
  });
  app.post("/api/bill-expenses", { bodyLimit: 16384 }, async (req, reply) => {
    const roomId = await scoped(req, "billsPayments", "create");
    const actorId = (await authenticated(req)).id;
    return reply.status(201).send({ expense: await store.createBillExpense(billExpenseSchema.parse(req.body), roomId, actorId) });
  });
  app.put<{ Params: { id: string } }>("/api/bill-expenses/:id", { bodyLimit: 16384 }, async (req) => {
    const roomId = await scoped(req, "billsPayments", "modify");
    const expense = await store.updateBillExpense(req.params.id, billExpenseSchema.parse(req.body), roomId);
    if (!expense) throw new ApiError("NOT_FOUND", 404); return { expense };
  });
  app.delete<{ Params: { id: string } }>("/api/bill-expenses/:id", async (req, reply) => {
    const roomId = await scoped(req, "billsPayments", "delete");
    if (!(await store.deleteBillExpense(req.params.id, roomId))) throw new ApiError("NOT_FOUND", 404);
    return reply.status(204).send();
  });
  app.get<{ Params: { id: string } }>("/api/bill-categories/:id", async (req) => {
    const roomId = await scoped(req, "billsCategories", "view");
    const category = await store.findBillCategory(patientIdSchema.parse(req.params.id), roomId);
    if (!category) throw new ApiError("NOT_FOUND", 404);
    return { category };
  });
  app.post("/api/bill-categories", { bodyLimit: 16384 }, async (req, reply) => {
    const roomId = await scoped(req, "billsCategories", "create");
    return reply.status(201).send({ category: await store.createBillCategory(billCategorySchema.parse(req.body), roomId) });
  });
  app.put<{ Params: { id: string } }>("/api/bill-categories/:id", { bodyLimit: 16384 }, async (req) => {
    const roomId = await scoped(req, "billsCategories", "modify");
    const category = await store.updateBillCategory(patientIdSchema.parse(req.params.id), billCategorySchema.parse(req.body), roomId);
    if (!category) throw new ApiError("NOT_FOUND", 404);
    return { category };
  });
  app.patch<{ Params: { id: string } }>("/api/bill-categories/:id/status", async (req) => {
    const roomId = await scoped(req, "billsCategories", "modify");
    const { active } = billCategoryStatusSchema.parse(req.body);
    const category = await store.setBillCategoryActive(patientIdSchema.parse(req.params.id), active, roomId);
    if (!category) throw new ApiError("NOT_FOUND", 404);
    return { category };
  });
  app.get("/api/laboratories", async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "view");
    return store.searchLaboratories(laboratoryCatalogSearchSchema.parse(req.query), roomId);
  });
  app.get<{ Params: { id: string } }>("/api/laboratories/:id", async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "view");
    const laboratory = await store.findLaboratory(patientIdSchema.parse(req.params.id), roomId);
    if (!laboratory) throw new ApiError("NOT_FOUND", 404);
    return { laboratory };
  });
  app.post("/api/laboratories", { bodyLimit: 32768 }, async (req, reply) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "create");
    return reply.status(201).send({ laboratory: await store.createLaboratory(laboratoryCatalogSchema.parse(req.body), roomId) });
  });
  app.put<{ Params: { id: string } }>("/api/laboratories/:id", { bodyLimit: 32768 }, async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "modify");
    const laboratory = await store.updateLaboratory(patientIdSchema.parse(req.params.id), laboratoryCatalogSchema.parse(req.body), roomId);
    if (!laboratory) throw new ApiError("NOT_FOUND", 404);
    return { laboratory };
  });
  app.patch<{ Params: { id: string } }>("/api/laboratories/:id/status", async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "modify");
    const { active } = laboratoryCatalogStatusSchema.parse(req.body);
    const laboratory = await store.setLaboratoryActive(patientIdSchema.parse(req.params.id), active, roomId);
    if (!laboratory) throw new ApiError("NOT_FOUND", 404);
    return { laboratory };
  });
  app.get<{ Params: { id: string } }>("/api/laboratories/:id/rates", async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "view");
    return { rates: await store.listLaboratoryRates(patientIdSchema.parse(req.params.id), roomId) };
  });
  app.post<{ Params: { id: string } }>("/api/laboratories/:id/rates", { bodyLimit: 32768 }, async (req, reply) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "create");
    const rate = await store.createLaboratoryRate(patientIdSchema.parse(req.params.id), laboratoryRateSchema.parse(req.body), roomId);
    return reply.status(201).send({ rate });
  });
  app.put<{ Params: { id: string; rateId: string } }>("/api/laboratories/:id/rates/:rateId", { bodyLimit: 32768 }, async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "modify");
    const rate = await store.updateLaboratoryRate(patientIdSchema.parse(req.params.id), patientIdSchema.parse(req.params.rateId), laboratoryRateSchema.parse(req.body), roomId);
    if (!rate) throw new ApiError("NOT_FOUND", 404);
    return { rate };
  });
  app.patch<{ Params: { id: string; rateId: string } }>("/api/laboratories/:id/rates/:rateId/status", async (req) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "modify");
    const { active } = laboratoryCatalogStatusSchema.parse(req.body);
    const rate = await store.setLaboratoryRateActive(patientIdSchema.parse(req.params.id), patientIdSchema.parse(req.params.rateId), active, roomId);
    if (!rate) throw new ApiError("NOT_FOUND", 404);
    return { rate };
  });
  app.delete<{ Params: { id: string; rateId: string } }>("/api/laboratories/:id/rates/:rateId", async (req, reply) => {
    const roomId = await scoped(req, "laboratoriesCatalog", "delete");
    const deleted = await store.deleteLaboratoryRate(patientIdSchema.parse(req.params.id), patientIdSchema.parse(req.params.rateId), roomId);
    if (!deleted) throw new ApiError("NOT_FOUND", 404);
    return reply.status(204).send();
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
    const roomId = await scoped(req, "currencySetup", "view");
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
    const roomId = await scoped(req, "currencySetup", "modify");
    const { baseCurrency } = currencySettingsSchema.parse(req.body);
    await store.setBaseCurrency(baseCurrency, roomId);
    return { baseCurrency };
  });
  app.put("/currencies/rates", async (req) => {
    const roomId = await scoped(req, "currencySetup", "view");
    const rate = exchangeRateSchema.parse(req.body);
    if (rate.date > clinicDate()) throw new ApiError("VALIDATION_ERROR", 400);
    const existing = (
      await store.listExchangeRates(rate.date.slice(0, 4), roomId)
    ).some((r) => r.date === rate.date);
    await scoped(req, "currencySetup", existing ? "modify" : "create");
    await store.saveExchangeRate(rate, roomId, !existing);
    return { rate };
  });
  registerDatabaseBackup(app, config, (request, action) => authorized(request, "backupRestore", action));
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
        (["/", "/login", "/dashboard", "/appointments", "/settings", "/settings/general", "/settings/currency", "/settings/backup", "/settings/help", "/admin", "/admin/users", "/admin/locations", "/admin/logs", "/reports/clinical", "/reports/new-patients", "/reports/patients-statement", "/reports/completed-balances", "/reports/lab-statement", "/reports/billing-payments", "/reports/inventory", "/treatment"].includes(
          req.url.split("?")[0],
        ) ||
          /^\/(?:patients|procedures)(?:\/(?:new|\d+))?$/.test(req.url.split("?")[0]) ||
          /^\/admin\/users\/(?:new|[0-9a-f-]{36})$/.test(req.url.split("?")[0]))
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
