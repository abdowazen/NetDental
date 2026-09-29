import type { FastifyInstance, FastifyRequest } from "fastify";
import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { patientFileMetadataSchema, patientIdSchema, type Action } from "@clinic/shared";
import type { PatientFileStore } from "./patient-files.js";
import { AccessError } from "./access.js";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const params = z.object({ patientId: patientIdSchema, id: z.string().uuid().optional() });
const query = z.object({ originalName: z.string(), kind: z.string(), mimeType: z.string(), tooth: z.string().optional(), date: z.string(), description: z.string().default("") }).strict();

function detectedMime(content: Buffer) {
  if (content.length >= 4 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
  if (content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (content.length >= 12 && content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (content.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

export function registerPatientFiles(app: FastifyInstance, store: PatientFileStore, root: string,
  scope: (req: FastifyRequest, action: Action) => Promise<{ roomId: number; actorId: string }>) {
  const folder = resolve(root);
  app.get("/api/patient-files/:patientId", async (req) => {
    const { roomId } = await scope(req, "view");
    return { files: await store.listPatientFiles(params.parse(req.params).patientId, roomId) };
  });
  app.post("/api/patient-files/:patientId", { bodyLimit: MAX_FILE_SIZE }, async (req, reply) => {
    const { roomId, actorId } = await scope(req, "create");
    const parsed = query.parse(req.query);
    const body = req.body;
    if (!Buffer.isBuffer(body) || !body.length || body.length > MAX_FILE_SIZE) throw new AccessError("VALIDATION_ERROR");
    const mimeType = detectedMime(body);
    const input = patientFileMetadataSchema.parse({ ...parsed, mimeType, tooth: parsed.tooth || null });
    if (mimeType !== parsed.mimeType) throw new AccessError("VALIDATION_ERROR");
    await mkdir(folder, { recursive: true });
    const storedName = randomUUID();
    const target = resolve(folder, storedName);
    await writeFile(target, body, { flag: "wx" });
    try {
      const file = await store.createPatientFile(params.parse(req.params).patientId, roomId, actorId, storedName, body.length, input);
      return reply.status(201).send({ file });
    } catch (error) {
      await unlink(target).catch(() => undefined);
      throw error;
    }
  });
  app.get("/api/patient-files/:patientId/:id/content", async (req, reply) => {
    const { roomId } = await scope(req, "view");
    const p = params.parse(req.params);
    const file = await store.getPatientFile(p.patientId, roomId, p.id!);
    const target = resolve(folder, file.storedName);
    if (!target.startsWith(folder)) throw new AccessError("NOT_FOUND");
    reply.header("Content-Type", file.mimeType);
    reply.header("Content-Length", String(file.size));
    reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    reply.header("X-Content-Type-Options", "nosniff");
    return reply.send(createReadStream(target));
  });
  app.delete("/api/patient-files/:patientId/:id", async (req, reply) => {
    const { roomId } = await scope(req, "delete");
    const p = params.parse(req.params);
    const storedName = await store.deletePatientFile(p.patientId, roomId, p.id!);
    await unlink(resolve(folder, storedName)).catch(() => undefined);
    return reply.status(204).send();
  });
}
