CREATE TYPE "Role" AS ENUM ('DENTIST');
CREATE TYPE "Language" AS ENUM ('en', 'fr');
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY, "username" VARCHAR(64) NOT NULL,
  "passwordHash" TEXT NOT NULL, "displayName" VARCHAR(100) NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'DENTIST', "preferredLanguage" "Language" NOT NULL DEFAULT 'en',
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_username_normalized" CHECK ("username" = lower("username") AND "username" ~ '^[a-z0-9._-]{3,64}$')
);
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "tokenHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
