-- AlterTable
ALTER TABLE "Operator" ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Operator_inviteTokenHash_key" ON "Operator"("inviteTokenHash");

