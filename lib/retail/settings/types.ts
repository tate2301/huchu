import type { Prisma } from "@prisma/client";

import type { RetailAuditActor } from "@/lib/retail/audit";

/**
 * Where a settings page's values live (the server's half of a page in
 * `lib/retail/settings-pages`): read them all as the page shows them, write
 * the changed ones inside the save's transaction.
 */
export type SettingsStore = {
  load(companyId: string): Promise<Record<string, unknown>>;
  /** `changes` are checked against the page's schema and differ from what is stored. */
  save(tx: Prisma.TransactionClient, actor: RetailAuditActor, changes: Record<string, unknown>): Promise<void>;
  /** Other rows whose events belong in this page's Activity. */
  related?(companyId: string): Array<{ entityType: string; ids: string[] }>;
};
