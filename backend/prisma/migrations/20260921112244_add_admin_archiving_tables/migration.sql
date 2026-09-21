-- AlterTable
ALTER TABLE "active_sessions" ADD COLUMN     "endedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pending_archives" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_audit_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSecs" INTEGER NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_activity_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT,
    "ipAddr" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_archives_sessionId_key" ON "pending_archives"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "session_audit_logs_sessionId_key" ON "session_audit_logs"("sessionId");

-- CreateIndex
CREATE INDEX "session_audit_logs_archivedAt_idx" ON "session_audit_logs"("archivedAt");

-- CreateIndex
CREATE INDEX "session_audit_logs_initiatorId_idx" ON "session_audit_logs"("initiatorId");

-- CreateIndex
CREATE INDEX "session_audit_logs_receiverId_idx" ON "session_audit_logs"("receiverId");

-- AddForeignKey
ALTER TABLE "pending_archives" ADD CONSTRAINT "pending_archives_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "active_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_audit_logs" ADD CONSTRAINT "session_audit_logs_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_audit_logs" ADD CONSTRAINT "session_audit_logs_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
