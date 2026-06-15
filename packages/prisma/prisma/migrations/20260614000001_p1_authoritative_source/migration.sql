-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "assistantId" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "content" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "inputKind" TEXT NOT NULL DEFAULT 'message',
ADD COLUMN     "lastSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ADD COLUMN     "llmConfig" JSONB,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "requestContext" JSONB,
ADD COLUMN     "resumePayload" JSONB,
ADD COLUMN     "traceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RunEvent_runId_seq_key" ON "RunEvent"("runId", "seq");
