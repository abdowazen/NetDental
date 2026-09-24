import { PrismaClient, type User, type Session } from "@prisma/client";
import type { Language, Currency, ExchangeRate } from "@clinic/shared";
import { patientStore, type PatientStore } from "./patients.js";
import { procedureStore, type ProcedureStore } from "./procedures.js";
import { odontogramStore, type OdontogramStore } from "./odontogram.js";
import { accessStore, type AccessStore } from "./access.js";
export type NewDentist = {
  username: string;
  passwordHash: string;
  displayName: string;
  preferredLanguage: Language;
};
export interface Store extends PatientStore, ProcedureStore, OdontogramStore, AccessStore {
  getBaseCurrency(roomId: number): Promise<Currency>;
  setBaseCurrency(currency: Currency, roomId: number): Promise<void>;
  listExchangeRates(year: string, roomId: number): Promise<ExchangeRate[]>;
  saveExchangeRate(
    rate: ExchangeRate,
    roomId: number,
    createOnly?: boolean,
  ): Promise<void>;
  health(): Promise<void>;
  findUser(username: string): Promise<User | null>;
  createUser(data: NewDentist): Promise<User>;
  createSession(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findSession(tokenHash: string): Promise<(Session & { user: User }) | null>;
  deleteSession(tokenHash: string): Promise<void>;
  clearExpired(): Promise<void>;
  updateLanguage(id: string, language: Language): Promise<User>;
}
export function prismaStore(db: PrismaClient): Store {
  return {
    ...patientStore(db),
    ...procedureStore(db),
    ...odontogramStore(db),
    ...accessStore(db),
    async getBaseCurrency(roomId) {
      return (
        (await db.currencySettings.findUnique({ where: { id: roomId } }))
          ?.baseCurrency ?? "USD"
      );
    },
    async setBaseCurrency(baseCurrency, roomId) {
      await db.currencySettings.upsert({
        where: { id: roomId },
        create: { id: roomId, baseCurrency },
        update: { baseCurrency },
      });
    },
    async listExchangeRates(year, roomId) {
      const rates = await db.exchangeRate.findMany({
        where: {
          roomId,
          date: {
            gte: new Date(`${year}-01-01T00:00:00Z`),
            lte: new Date(`${year}-12-31T00:00:00Z`),
          },
        },
        orderBy: { date: "desc" },
      });
      return rates.map((rate) => ({
        date: rate.date.toISOString().slice(0, 10),
        lbpPerUsd: rate.lbpPerUsd.toFixed(),
      }));
    },
    async saveExchangeRate(rate, roomId, createOnly = false) {
      const date = new Date(`${rate.date}T00:00:00Z`);
      if (createOnly) {
        await db.exchangeRate.create({
          data: { date, roomId, lbpPerUsd: rate.lbpPerUsd },
        });
        return;
      }
      await db.exchangeRate.upsert({
        where: { roomId_date: { roomId, date } },
        create: { date, roomId, lbpPerUsd: rate.lbpPerUsd },
        update: { lbpPerUsd: rate.lbpPerUsd },
      });
    },
    async health() {
      await db.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
      await db.$queryRaw`SELECT 1 FROM "Session" LIMIT 1`;
    },
    findUser: (username) => db.user.findUnique({ where: { username } }),
    createUser: (data) => db.user.create({ data }),
    async createSession(data) {
      await db.session.create({ data });
    },
    findSession: (tokenHash) =>
      db.session.findUnique({ where: { tokenHash }, include: { user: true } }),
    async deleteSession(tokenHash) {
      await db.session.deleteMany({ where: { tokenHash } });
    },
    async clearExpired() {
      await db.session.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });
    },
    updateLanguage: (id, preferredLanguage) =>
      db.user.update({ where: { id }, data: { preferredLanguage } }),
  };
}
