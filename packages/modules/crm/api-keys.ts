/**
 * CRM webhook API keys.
 *
 * The plaintext key is shown once at creation; only a sha256 hash is stored.
 * Keys are `crm_<40 hex chars>`; the first 12 chars (`crm_` + 8) are stored
 * separately as a display prefix.
 */
import { createHash, randomBytes } from "crypto";

import { prisma } from "@corelithzw/db/client";

const KEY_BYTES = 20; // → 40 hex chars

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `crm_${randomBytes(KEY_BYTES).toString("hex")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

/**
 * Resolve a raw API key to its (active) CrmApiKey row, or null. Touches
 * lastUsedAt as a fire-and-forget side effect.
 */
export async function verifyApiKey(rawKey: string | null | undefined): Promise<{
  id: string;
  companyId: string;
  defaultChannel: string | null;
  defaultSourceLabel: string | null;
} | null> {
  if (!rawKey || !rawKey.startsWith("crm_")) return null;
  const hash = hashApiKey(rawKey);
  const row = await prisma.crmApiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      companyId: true,
      revokedAt: true,
      defaultChannel: true,
      defaultSourceLabel: true,
    },
  });
  if (!row || row.revokedAt) return null;

  void prisma.crmApiKey
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    id: row.id,
    companyId: row.companyId,
    defaultChannel: row.defaultChannel,
    defaultSourceLabel: row.defaultSourceLabel,
  };
}
