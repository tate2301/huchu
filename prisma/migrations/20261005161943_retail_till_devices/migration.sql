-- SET-03: tills and the devices that run Tender at them (10-setup W-04, W-76, 4.3).
-- A till (`RetailRegister`) is where money is taken; a device is what runs
-- Tender there, one active device per till. A pairing code is good once, for
-- 10 minutes, and only its hash is kept. "Send a message" leaves a banner on
-- the till until dismissed. The plan sets how many tills may be paired
-- (`SubscriptionPlan.maxTills`, C-07).

-- CreateEnum
CREATE TYPE "RetailDeviceKind" AS ENUM ('COUNTER_MINI', 'KORA', 'BROWSER');

-- CreateEnum
CREATE TYPE "RetailDeviceUnpairReason" AS ENUM ('UNPAIRED', 'REPLACED', 'SITE_CLOSED', 'ACCOUNT_CLOSED');

-- CreateEnum
CREATE TYPE "RetailPairingPurpose" AS ENUM ('PAIR', 'REPLACE');

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN "maxTills" INTEGER;

-- AlterTable
ALTER TABLE "RetailRegister" ADD COLUMN "createdById" TEXT,
ADD COLUMN "deviceKind" "RetailDeviceKind" NOT NULL DEFAULT 'COUNTER_MINI',
ADD COLUMN "hasDrawer" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "hasPrinter" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "hasScale" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "priceListId" TEXT;

-- CreateTable
CREATE TABLE "RetailDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "kind" "RetailDeviceKind" NOT NULL,
    "label" TEXT,
    "keyHash" TEXT NOT NULL,
    "appVersion" TEXT,
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pairedById" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "unpairedAt" TIMESTAMP(3),
    "unpairedById" TEXT,
    "unpairReason" "RetailDeviceUnpairReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPairingCode" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "purpose" "RetailPairingPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetailPairingCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailPairingThrottle" (
    "companyId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailPairingThrottle_pkey" PRIMARY KEY ("companyId","installId")
);

-- CreateTable
CREATE TABLE "RetailDeviceMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "registerId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),

    CONSTRAINT "RetailDeviceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailDevice_keyHash_key" ON "RetailDevice"("keyHash");

-- CreateIndex
CREATE INDEX "RetailDevice_companyId_registerId_unpairedAt_idx" ON "RetailDevice"("companyId", "registerId", "unpairedAt");

-- CreateIndex
CREATE INDEX "RetailPairingCode_companyId_codeHash_idx" ON "RetailPairingCode"("companyId", "codeHash");

-- CreateIndex
CREATE INDEX "RetailPairingCode_registerId_usedAt_expiresAt_idx" ON "RetailPairingCode"("registerId", "usedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "RetailDeviceMessage_registerId_dismissedAt_idx" ON "RetailDeviceMessage"("registerId", "dismissedAt");

-- AddForeignKey
ALTER TABLE "RetailRegister" ADD CONSTRAINT "RetailRegister_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "PriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailRegister" ADD CONSTRAINT "RetailRegister_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDevice" ADD CONSTRAINT "RetailDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDevice" ADD CONSTRAINT "RetailDevice_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "RetailRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDevice" ADD CONSTRAINT "RetailDevice_pairedById_fkey" FOREIGN KEY ("pairedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDevice" ADD CONSTRAINT "RetailDevice_unpairedById_fkey" FOREIGN KEY ("unpairedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPairingCode" ADD CONSTRAINT "RetailPairingCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPairingCode" ADD CONSTRAINT "RetailPairingCode_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "RetailRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailPairingCode" ADD CONSTRAINT "RetailPairingCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDeviceMessage" ADD CONSTRAINT "RetailDeviceMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDeviceMessage" ADD CONSTRAINT "RetailDeviceMessage_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "RetailRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailDeviceMessage" ADD CONSTRAINT "RetailDeviceMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One active device per till: a second pairing must unpair the first.
CREATE UNIQUE INDEX "RetailDevice_one_active_per_register" ON "RetailDevice" ("registerId") WHERE "unpairedAt" IS NULL;

-- The catalogue's till limits (feature-catalog `includedTills`): Fiscal 1, Start 2, Grow 8, the rest any number.
UPDATE "SubscriptionPlan" SET "maxTills" = 1 WHERE "code" = 'FISCAL';
UPDATE "SubscriptionPlan" SET "maxTills" = 2 WHERE "code" = 'START';
UPDATE "SubscriptionPlan" SET "maxTills" = 8 WHERE "code" = 'GROW';
