-- Vane's chat in the panel (VaneMessage, one conversation per person) and the actions
-- it proposes for a person to approve or deny (VaneAction). Nothing runs until approved.
-- CreateEnum
CREATE TYPE "VaneMessageAuthor" AS ENUM ('PERSON', 'VANE');

-- CreateEnum
CREATE TYPE "VaneActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'DONE', 'FAILED', 'DENIED');

-- CreateTable
CREATE TABLE "VaneMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "author" "VaneMessageAuthor" NOT NULL,
    "text" TEXT NOT NULL,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaneMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VaneAction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT,
    "messageId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" "VaneActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "result" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VaneAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VaneMessage_companyId_userId_createdAt_idx" ON "VaneMessage"("companyId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "VaneMessage_userId_idx" ON "VaneMessage"("userId");

-- CreateIndex
CREATE INDEX "VaneMessage_jobId_idx" ON "VaneMessage"("jobId");

-- CreateIndex
CREATE INDEX "VaneAction_companyId_status_createdAt_idx" ON "VaneAction"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VaneAction_itemId_idx" ON "VaneAction"("itemId");

-- CreateIndex
CREATE INDEX "VaneAction_messageId_idx" ON "VaneAction"("messageId");

-- CreateIndex
CREATE INDEX "VaneAction_decidedById_idx" ON "VaneAction"("decidedById");

-- AddForeignKey
ALTER TABLE "VaneMessage" ADD CONSTRAINT "VaneMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneMessage" ADD CONSTRAINT "VaneMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneMessage" ADD CONSTRAINT "VaneMessage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "VaneJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneAction" ADD CONSTRAINT "VaneAction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneAction" ADD CONSTRAINT "VaneAction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "VaneItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneAction" ADD CONSTRAINT "VaneAction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "VaneMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaneAction" ADD CONSTRAINT "VaneAction_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Vane's reader reaches VaneAction, as `pnpm vane:reader-sql` prints it. VaneMessage is a
-- person's own conversation: neither reader role reads it (lib/vane/reader-access.ts).
ALTER TABLE "VaneAction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneAction" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VaneAction" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "itemId", "messageId", "kind", "title", "params", "status", "result", "decidedById", "decidedAt", "doneAt", "createdAt") ON "VaneAction" TO vane_reader;
