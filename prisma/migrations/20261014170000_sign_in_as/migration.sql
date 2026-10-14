/*
  Warnings:

  - You are about to drop the `SupportAccessRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SupportSession` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SignInAsMode" AS ENUM ('LOOK', 'CHANGE');

-- CreateEnum
CREATE TYPE "SignInAsEnd" AS ENUM ('OPERATOR', 'OWNER', 'SIGNED_OUT');

-- DropForeignKey
ALTER TABLE "SupportAccessRequest" DROP CONSTRAINT "SupportAccessRequest_companyId_fkey";

-- DropForeignKey
ALTER TABLE "SupportSession" DROP CONSTRAINT "SupportSession_companyId_fkey";

-- AlterTable
ALTER TABLE "SessionHandoff" ADD COLUMN     "signInAsSessionId" TEXT;

-- DropTable
DROP TABLE "SupportAccessRequest";

-- DropTable
DROP TABLE "SupportSession";

-- DropEnum
DROP TYPE "SupportAccessScope";

-- DropEnum
DROP TYPE "SupportAccessStatus";

-- DropEnum
DROP TYPE "SupportSessionMode";

-- CreateTable
CREATE TABLE "SignInAsSession" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "mode" "SignInAsMode" NOT NULL,
    "reason" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedBy" "SignInAsEnd",
    "ownerEndTokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInAsSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignInAsSession_number_key" ON "SignInAsSession"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SignInAsSession_ownerEndTokenHash_key" ON "SignInAsSession"("ownerEndTokenHash");

-- CreateIndex
CREATE INDEX "SignInAsSession_companyId_startedAt_idx" ON "SignInAsSession"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "SignInAsSession_operatorId_endedAt_idx" ON "SignInAsSession"("operatorId", "endedAt");

-- CreateIndex
CREATE INDEX "SessionHandoff_signInAsSessionId_idx" ON "SessionHandoff"("signInAsSessionId");

-- AddForeignKey
ALTER TABLE "SessionHandoff" ADD CONSTRAINT "SessionHandoff_signInAsSessionId_fkey" FOREIGN KEY ("signInAsSessionId") REFERENCES "SignInAsSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInAsSession" ADD CONSTRAINT "SignInAsSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInAsSession" ADD CONSTRAINT "SignInAsSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInAsSession" ADD CONSTRAINT "SignInAsSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
