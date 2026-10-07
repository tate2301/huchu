import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { restorableUntil } from "@/lib/retail/asks";
import { binKind, listBinEntries, type BinEntry } from "@/lib/retail/bin";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * Setup › Bin (80-admin 4.5, `retail-bin`): every record in the bin now,
 * of every kind, with who moved it and the day it goes for good.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last three days before it goes read in --warn. */
const WARN_DAYS = 3;

export function toBinRow(entry: BinEntry, role: string, now: Date): ReportRow {
  const spec = binKind(entry.kind);
  const goneAt = restorableUntil(entry.binnedAt);
  // "Open it" needs the record's own view right; restoring does not (Restore is Bin U).
  const openable = Boolean(spec.openKey) && canRetailRoleDo(role, ...spec.viewRight);
  return {
    id: `${entry.kind}:${entry.id}`,
    kind: entry.kind,
    what: entry.name,
    reference: entry.reference,
    kindLabel: entry.label,
    binnedBy: entry.binnedBy,
    binnedAt: entry.binnedAt.toISOString(),
    goneAt: goneAt.toISOString(),
    goneTone: goneAt.getTime() - now.getTime() <= WARN_DAYS * DAY_MS ? "warn" : null,
    restore: "Restore",
    openable: openable ? "yes" : null,
    ...(openable && spec.openKey ? { [spec.openKey]: entry.id } : {}),
  };
}

async function loadBin(ctx: ReportContext) {
  const now = new Date();
  const entries = await listBinEntries(ctx.companyId, now);
  return result(entries.map((entry) => toBinRow(entry, ctx.role, now)));
}

/** Kind: the kinds in the bin now, by their labels ("Product", "Category"). */
async function binOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const entries = await listBinEntries(ctx.companyId);
  const kinds = [...new Set(entries.map((entry) => entry.kind))];
  return { kind: kinds.map((kind) => ({ value: kind, label: binKind(kind).label })) };
}

export const BIN_LOADERS: Record<string, ReportLoader> = {
  "retail-bin": { load: loadBin, options: binOptions },
};
