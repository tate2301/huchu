import type { AccountingSourceType } from "@prisma/client";

function normalizeForKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function buildAccountingEventKey(input: {
  companyId: string;
  sourceDomain: string;
  sourceAction: string;
  sourceType?: AccountingSourceType | null;
  sourceId?: string | null;
  fallback?: string;
}) {
  const parts = [
    normalizeForKey(input.companyId),
    normalizeForKey(input.sourceDomain),
    normalizeForKey(input.sourceAction),
    input.sourceType ? normalizeForKey(input.sourceType) : "no-source-type",
    input.sourceId ? normalizeForKey(input.sourceId) : normalizeForKey(input.fallback ?? "no-source-id"),
  ];

  return parts.join(":");
}
