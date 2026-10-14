-- Muted (PageVaneMuted, approved 14 Oct): what one person chose for a kind of card they keep
-- setting aside. Stop it for me (stopped = true) hides that kind from their own For you; Keep
-- showing it (stopped = false) stops Vane asking. One row per person and kind, in one workspace.
CREATE TABLE "VaneCardChoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardKey" TEXT NOT NULL,
    "stopped" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaneCardChoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaneCardChoice_companyId_userId_cardKey_key" ON "VaneCardChoice"("companyId", "userId", "cardKey");
CREATE INDEX "VaneCardChoice_userId_idx" ON "VaneCardChoice"("userId");
ALTER TABLE "VaneCardChoice" ADD CONSTRAINT "VaneCardChoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaneCardChoice" ADD CONSTRAINT "VaneCardChoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Vane's reader reaches the new table, as `pnpm vane:reader-sql` prints it.
ALTER TABLE "VaneCardChoice" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_all" ON "VaneCardChoice" AS PERMISSIVE FOR ALL TO PUBLIC USING (true) WITH CHECK (true);
CREATE POLICY "vane_workspace" ON "VaneCardChoice" AS RESTRICTIVE FOR SELECT TO vane_reader USING ("companyId" = (SELECT s."companyId" FROM "VaneReaderScope" s WHERE s."pid" = pg_backend_pid()));
GRANT SELECT ("id", "companyId", "userId", "cardKey", "stopped", "createdAt", "updatedAt") ON "VaneCardChoice" TO vane_reader;
