-- CreateEnum
CREATE TYPE "PlatformWebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "PlatformWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformOutboxEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformOutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformWebhookDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "status" "PlatformWebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformWebhookEndpoint_companyId_active_idx" ON "PlatformWebhookEndpoint"("companyId", "active");

-- CreateIndex
CREATE INDEX "PlatformOutboxEvent_companyId_createdAt_idx" ON "PlatformOutboxEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformWebhookDelivery_status_nextAttemptAt_idx" ON "PlatformWebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "PlatformWebhookDelivery_endpointId_createdAt_idx" ON "PlatformWebhookDelivery"("endpointId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformWebhookEndpoint" ADD CONSTRAINT "PlatformWebhookEndpoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformWebhookEndpoint" ADD CONSTRAINT "PlatformWebhookEndpoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformOutboxEvent" ADD CONSTRAINT "PlatformOutboxEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformWebhookDelivery" ADD CONSTRAINT "PlatformWebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PlatformOutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformWebhookDelivery" ADD CONSTRAINT "PlatformWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "PlatformWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

