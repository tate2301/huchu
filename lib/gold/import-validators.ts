/**
 * Shared validators for gold ledger imports. Used by:
 *   - the dry-run endpoint (POST /api/gold/imports/[id]/dry-run) for the
 *     preview gate.
 *   - the legacy commit endpoint (POST /api/gold/imports/[id]/commit) so
 *     anomalies surface in the same shape regardless of code path.
 *
 * Anomaly model
 * -------------
 *  - INFO     : informational, never blocks commit.
 *  - WARN     : reviewer must accept-as-is to commit.
 *  - CRITICAL : blocks commit unconditionally.
 *
 * Validation is row-by-row plus a single oversell pass that simulates FIFO
 * draw-down without writing.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type AnomalyCode =
  | "MISSING_DATE"
  | "MISSING_NAME"
  | "EMPTY_ROW"
  | "SPLIT_MISMATCH"
  | "OVERSELL"
  | "NEGATIVE_SHARE"
  | "FUTURE_DATE"
  | "UNKNOWN_EXPENSE_TYPE"
  | "DUPLICATE_DATE_LEADER"
  | "UNMAPPED_LEADER"
  | "FAILED_PARSE";

export type AnomalySeverity = "INFO" | "WARN" | "CRITICAL";

export type DryRunAnomaly = {
  entryId: string;
  code: AnomalyCode;
  severity: AnomalySeverity;
  message: string;
  suggestedFix?: string | null;
};

export type DryRunSummary = {
  anomalies: DryRunAnomaly[];
  countsBySeverity: { INFO: number; WARN: number; CRITICAL: number };
  countsByCode: Record<AnomalyCode, number>;
};

type EntryShape = {
  id: string;
  lineNo: number;
  parsedDate: Date | null;
  parsedName: string | null;
  mappedShiftGroupId: string | null;
  gramsTotal: number | null;
  expensesJson: string | null;
  boysGrams: number | null;
  mdaraGrams: number | null;
  balGrams: number | null;
  parserWarning?: string | null;
};

type ImportShape = {
  id: string;
  companyId: string;
  siteId: string | null;
  mappingsJson: string | null;
  entries: EntryShape[];
};

const SPLIT_TOLERANCE = 0.001;

function parseExpenses(json: string | null): Array<{ type: string; weight: number }> {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as Array<{ type: string; weight: number }>;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function emptyCounts(): DryRunSummary["countsByCode"] {
  return {
    MISSING_DATE: 0,
    MISSING_NAME: 0,
    EMPTY_ROW: 0,
    SPLIT_MISMATCH: 0,
    OVERSELL: 0,
    NEGATIVE_SHARE: 0,
    FUTURE_DATE: 0,
    UNKNOWN_EXPENSE_TYPE: 0,
    DUPLICATE_DATE_LEADER: 0,
    UNMAPPED_LEADER: 0,
    FAILED_PARSE: 0,
  };
}

export async function runImportDryRun(
  db: Db,
  importRecord: ImportShape,
): Promise<DryRunSummary> {
  const anomalies: DryRunAnomaly[] = [];
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const futureCutoff = new Date(now.getTime() + dayMs);

  // Build the per-row mapping snapshot — leader names mapped to shift groups.
  const mappings: Record<string, string> = importRecord.mappingsJson
    ? JSON.parse(importRecord.mappingsJson)
    : {};

  // Pull master expense types for unknown-type detection (case-insensitive).
  let knownExpenseTypes: Set<string> = new Set();
  try {
    const types = await db.goldExpenseType.findMany({
      where: { companyId: importRecord.companyId, isActive: true },
      select: { name: true },
    });
    knownExpenseTypes = new Set(types.map((t) => t.name.toLowerCase()));
  } catch {
    // If the master is empty/missing, we silently treat every type as known
    // rather than blast every row with WARN — the operator can configure
    // master types later.
  }

  // Leader-key dedup (date + name). Same date + same leader twice is almost
  // always a transcription error in the source ledger.
  const leaderKeyCounts = new Map<string, number>();
  for (const e of importRecord.entries) {
    if (e.parsedDate && e.parsedName) {
      const key = `${e.parsedDate.toISOString().slice(0, 10)}::${e.parsedName.trim().toLowerCase()}`;
      leaderKeyCounts.set(key, (leaderKeyCounts.get(key) ?? 0) + 1);
    }
  }

  for (const e of importRecord.entries) {
    if (e.parserWarning) {
      anomalies.push({
        entryId: e.id,
        code: "FAILED_PARSE",
        severity: "WARN",
        message: e.parserWarning,
      });
    }

    const isEmpty = e.gramsTotal == null && e.balGrams == null;
    if (isEmpty) {
      anomalies.push({
        entryId: e.id,
        code: "EMPTY_ROW",
        severity: "WARN",
        message: "Row has neither a total nor a balance — nothing will be created.",
        suggestedFix: "Delete the row or fill in either gramsTotal or balGrams.",
      });
    }

    if (!e.parsedDate) {
      anomalies.push({
        entryId: e.id,
        code: "MISSING_DATE",
        severity: "CRITICAL",
        message: "Date is missing or unparseable.",
        suggestedFix: "Click the date cell to set it.",
      });
    } else if (e.parsedDate.getTime() > futureCutoff.getTime()) {
      anomalies.push({
        entryId: e.id,
        code: "FUTURE_DATE",
        severity: "WARN",
        message: `Row dated ${e.parsedDate.toISOString().slice(0, 10)} is in the future.`,
        suggestedFix: "Confirm the year/month — common typo on year boundaries.",
      });
    }

    // Names: only flag when the import has any leader names at all (a
    // sales-only ledger has none — that's fine).
    const importHasNames = importRecord.entries.some((row) => row.parsedName);
    if (importHasNames && !e.parsedName && (e.gramsTotal ?? 0) > 0) {
      anomalies.push({
        entryId: e.id,
        code: "MISSING_NAME",
        severity: "WARN",
        message: "Production row has no leader name parsed.",
        suggestedFix: "Re-check the source row's name column.",
      });
    }
    if (
      e.parsedName &&
      !e.mappedShiftGroupId &&
      !mappings[e.parsedName] &&
      (e.gramsTotal ?? 0) > 0
    ) {
      anomalies.push({
        entryId: e.id,
        code: "UNMAPPED_LEADER",
        severity: "CRITICAL",
        message: `Leader "${e.parsedName}" is not mapped to a shift group.`,
        suggestedFix: "Map this name in the mapping panel above.",
      });
    }

    if (e.gramsTotal != null) {
      const expenses = parseExpenses(e.expensesJson);
      const expSum = expenses.reduce((s, x) => s + x.weight, 0);
      const expectedTotal =
        (e.boysGrams ?? 0) + (e.mdaraGrams ?? 0) + expSum;
      const delta = Math.abs(expectedTotal - e.gramsTotal);
      if (delta > SPLIT_TOLERANCE) {
        anomalies.push({
          entryId: e.id,
          code: "SPLIT_MISMATCH",
          severity: "WARN",
          message: `Workers + Company + expenses (${expectedTotal.toFixed(3)} g) doesn't equal total (${e.gramsTotal.toFixed(3)} g).`,
          suggestedFix: `Delta is ${(expectedTotal - e.gramsTotal).toFixed(3)} g — check expense entries.`,
        });
      }

      for (const x of expenses) {
        if (knownExpenseTypes.size > 0 && !knownExpenseTypes.has(x.type.toLowerCase())) {
          anomalies.push({
            entryId: e.id,
            code: "UNKNOWN_EXPENSE_TYPE",
            severity: "INFO",
            message: `Unknown expense type "${x.type}".`,
            suggestedFix: "Add it to the company's GoldExpenseType master if it's a real category.",
          });
        }
      }
    }

    if ((e.boysGrams ?? 0) < 0) {
      anomalies.push({
        entryId: e.id,
        code: "NEGATIVE_SHARE",
        severity: "WARN",
        message: `Workers share is negative (${e.boysGrams!.toFixed(3)} g).`,
      });
    }
    if ((e.mdaraGrams ?? 0) < 0) {
      anomalies.push({
        entryId: e.id,
        code: "NEGATIVE_SHARE",
        severity: "WARN",
        message: `Company share is negative (${e.mdaraGrams!.toFixed(3)} g).`,
      });
    }

    if (e.parsedDate && e.parsedName) {
      const key = `${e.parsedDate.toISOString().slice(0, 10)}::${e.parsedName.trim().toLowerCase()}`;
      const count = leaderKeyCounts.get(key) ?? 0;
      if (count > 1) {
        anomalies.push({
          entryId: e.id,
          code: "DUPLICATE_DATE_LEADER",
          severity: "INFO",
          message: `${count} rows share (date, leader) = (${key.split("::")[0]}, ${e.parsedName}).`,
          suggestedFix: "Confirm both rows are real — the source often double-enters splits.",
        });
      }
    }
  }

  // Oversell pass — predicts inventory deficit by simulating FIFO.
  // We only run when there's a site to scope against (the commit endpoint
  // requires it anyway, and an oversell on the wrong site is meaningless).
  if (importRecord.siteId) {
    const onHandSnapshot = await db.goldInventoryEvent.groupBy({
      by: ["direction"],
      where: { companyId: importRecord.companyId, siteId: importRecord.siteId },
      _sum: { grams: true },
    });
    let onHandGrams = 0;
    for (const row of onHandSnapshot) {
      // Post Epic-6 Float→Decimal: _sum.grams may be a Prisma.Decimal.
      const v = row._sum.grams == null ? 0 : Number(row._sum.grams);
      onHandGrams += row.direction === "IN" ? v : -v;
    }

    // Add the production grams this import will produce (gramsTotal > 0 +
    // mapped) to the running pool, then subtract sales (negative balGrams)
    // in date order. Any sale that goes below zero is an oversell.
    type Tick =
      | { kind: "IN"; date: Date; grams: number }
      | { kind: "OUT"; date: Date; grams: number; entryId: string; lineNo: number };
    const ticks: Tick[] = [];
    for (const e of importRecord.entries) {
      if (!e.parsedDate) continue;
      if ((e.gramsTotal ?? 0) > 0) {
        ticks.push({ kind: "IN", date: e.parsedDate, grams: e.gramsTotal! });
      }
      if (e.balGrams != null && e.balGrams < 0) {
        ticks.push({
          kind: "OUT",
          date: e.parsedDate,
          grams: Math.abs(e.balGrams),
          entryId: e.id,
          lineNo: e.lineNo,
        });
      }
    }
    ticks.sort((a, b) => a.date.getTime() - b.date.getTime());
    let running = onHandGrams;
    for (const t of ticks) {
      if (t.kind === "IN") {
        running += t.grams;
      } else {
        if (t.grams - running > 0.0001) {
          anomalies.push({
            entryId: t.entryId,
            code: "OVERSELL",
            severity: "CRITICAL",
            message: `Sale draws ${t.grams.toFixed(3)} g but only ${Math.max(running, 0).toFixed(3)} g is on hand at this point in the ledger.`,
            suggestedFix: "Confirm the date or production rows above this one.",
          });
          // Don't double-flag downstream rows: let the simulation continue
          // assuming this drew everything available.
          running = 0;
        } else {
          running -= t.grams;
        }
      }
    }
  }

  // Stable order: by lineNo asc, then severity (CRITICAL first), then code.
  const lineByEntry = new Map<string, number>();
  for (const e of importRecord.entries) lineByEntry.set(e.id, e.lineNo);
  const sevOrder: Record<AnomalySeverity, number> = { CRITICAL: 0, WARN: 1, INFO: 2 };
  anomalies.sort((a, b) => {
    const la = lineByEntry.get(a.entryId) ?? 0;
    const lb = lineByEntry.get(b.entryId) ?? 0;
    if (la !== lb) return la - lb;
    if (sevOrder[a.severity] !== sevOrder[b.severity]) {
      return sevOrder[a.severity] - sevOrder[b.severity];
    }
    return a.code.localeCompare(b.code);
  });

  const countsBySeverity = { INFO: 0, WARN: 0, CRITICAL: 0 };
  const countsByCode = emptyCounts();
  for (const a of anomalies) {
    countsBySeverity[a.severity] += 1;
    countsByCode[a.code] += 1;
  }
  return { anomalies, countsBySeverity, countsByCode };
}
