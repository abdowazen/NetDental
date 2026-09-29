CREATE TABLE "SystemLog" (
  "id" UUID NOT NULL,
  "level" VARCHAR(10) NOT NULL,
  "source" VARCHAR(12) NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "method" VARCHAR(10) NOT NULL DEFAULT '',
  "path" VARCHAR(300) NOT NULL DEFAULT '',
  "userId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");
CREATE INDEX "SystemLog_source_createdAt_idx" ON "SystemLog"("source", "createdAt");
