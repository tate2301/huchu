"use client";

import { Fragment } from "react";
import Link from "next/link";
import { StatusChip } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";
import { EditableNumber, EditableDate } from "./editable-cells";
import { AnomalyInlineBadge } from "./anomaly-panel";
import {
  KNOWN_EXPENSE_TYPES,
  expenseWeightFor,
  parseExpenses,
  type Anomaly,
  type LedgerEntry,
} from "./types";

const STATUS_ROW_TINT: Record<LedgerEntry["status"], string> = {
  CREATED: "bg-emerald-50/50 border-l-2 border-l-emerald-400",
  ANOMALY: "bg-amber-50/60 border-l-2 border-l-amber-400",
  FAILED: "bg-rose-50/60 border-l-2 border-l-rose-400",
  PENDING: "border-l-2 border-l-transparent",
};

const STATUS_TONE: Record<
  LedgerEntry["status"],
  Parameters<typeof StatusChip>[0]["status"]
> = {
  CREATED: "passing",
  ANOMALY: "warning",
  FAILED: "danger",
  PENDING: "pending",
};

const grams = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toFixed(3)} g`;

export type ImportPreviewTableProps = {
  entries: LedgerEntry[];
  isLocked: boolean;
  anomaliesByEntry: Map<string, Anomaly[]>;
  groupNameForEntry: (entry: LedgerEntry) => string | null;
  onUpdateEntry: (
    entryId: string,
    patch: {
      parsedDate?: string | null;
      gramsTotal?: number | null;
      expensePatch?: { type: string; weight: number | null };
      boysGrams?: number | null;
      mdaraGrams?: number | null;
      balGrams?: number | null;
    },
  ) => void;
  rowAnchorPrefix?: string;
};

export function ImportPreviewTable({
  entries,
  isLocked,
  anomaliesByEntry,
  groupNameForEntry,
  onUpdateEntry,
  rowAnchorPrefix = "ledger-row-",
}: ImportPreviewTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
          <tr className="text-left">
            <th className="px-2 py-2 w-10">#</th>
            <th className="px-2 py-2">Date</th>
            <th className="px-2 py-2">Leader / Group</th>
            <th className="px-2 py-2 text-right">Gross</th>
            {KNOWN_EXPENSE_TYPES.map((t) => (
              <th key={t} className="px-2 py-2 text-right">
                {t}
              </th>
            ))}
            <th className="px-2 py-2 text-right">Other</th>
            <th className="px-2 py-2 text-right">Σ exp</th>
            <th className="px-2 py-2 text-right" title="Workers share">W: Workers</th>
            <th className="px-2 py-2 text-right" title="Company share">C: Company</th>
            <th className="px-2 py-2 text-right">Co. total</th>
            <th className="px-2 py-2 text-right">Bal</th>
            <th className="px-2 py-2">Batch</th>
            <th className="px-2 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const expenses = parseExpenses(e.expensesJson);
            const expenseTotal = expenses.reduce(
              (sum, exp) => sum + exp.weight,
              0,
            );
            const otherExpenses = expenses.filter(
              (exp) =>
                !KNOWN_EXPENSE_TYPES.some(
                  (t) => t.toLowerCase() === exp.type.toLowerCase(),
                ),
            );
            const otherTotal = otherExpenses.reduce(
              (s, x) => s + x.weight,
              0,
            );
            const companyTotal =
              e.mdaraGrams != null
                ? +(e.mdaraGrams + expenseTotal).toFixed(3)
                : null;
            const groupName = groupNameForEntry(e);
            const rowLocked = !!(
              e.goldShiftAllocationId ||
              e.goldPourId ||
              e.buyerReceiptId ||
              isLocked
            );
            const rowAnomalies = anomaliesByEntry.get(e.id) ?? [];
            const flagMessage = e.errorMessage ?? null;
            const flagSeverity: "warning" | "danger" | null =
              e.status === "FAILED"
                ? "danger"
                : e.status === "ANOMALY"
                  ? "warning"
                  : null;
            const colCount = 15;
            const setExpense =
              (type: string) => (next: number | null) => {
                onUpdateEntry(e.id, {
                  expensePatch: { type, weight: next },
                });
              };
            return (
              <Fragment key={e.id}>
                <tr
                  id={`${rowAnchorPrefix}${e.id}`}
                  className={cn(
                    "border-t align-top scroll-mt-24",
                    STATUS_ROW_TINT[e.status],
                  )}
                >
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {e.lineNo}
                  </td>
                  <td className="px-2 py-1.5">
                    <EditableDate
                      value={e.parsedDate}
                      onSave={(iso) =>
                        onUpdateEntry(e.id, { parsedDate: iso })
                      }
                      disabled={rowLocked}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="font-mono font-semibold">
                      {e.parsedName ?? "—"}
                    </div>
                    {groupName ? (
                      <div className="text-[10px] text-muted-foreground">
                        {groupName}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-700">
                        not mapped
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    <EditableNumber
                      value={e.gramsTotal}
                      onSave={(n) =>
                        onUpdateEntry(e.id, { gramsTotal: n })
                      }
                      disabled={rowLocked}
                    />
                  </td>
                  {KNOWN_EXPENSE_TYPES.map((t) => (
                    <td key={t} className="px-2 py-1.5 text-right">
                      <EditableNumber
                        value={expenseWeightFor(t, expenses)}
                        onSave={setExpense(t)}
                        disabled={rowLocked}
                      />
                    </td>
                  ))}
                  <td
                    className="px-2 py-1.5 text-right text-muted-foreground"
                    title={
                      otherExpenses.length === 0
                        ? "No other expense types"
                        : otherExpenses
                            .map(
                              (x) =>
                                `${x.type}: ${x.weight.toFixed(2)} g`,
                            )
                            .join(" · ")
                    }
                  >
                    {otherTotal > 0 ? (
                      <span>
                        {otherTotal.toFixed(2)}
                        <span className="ml-1 text-[10px]">
                          ({otherExpenses.length})
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {expenseTotal > 0 ? grams(expenseTotal) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-blue-700">
                    <EditableNumber
                      value={e.boysGrams}
                      onSave={(n) =>
                        onUpdateEntry(e.id, { boysGrams: n })
                      }
                      disabled={rowLocked}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right text-emerald-700">
                    <EditableNumber
                      value={e.mdaraGrams}
                      onSave={(n) =>
                        onUpdateEntry(e.id, { mdaraGrams: n })
                      }
                      disabled={rowLocked}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {grams(companyTotal)}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5 text-right",
                      e.balGrams != null &&
                        e.balGrams < 0 &&
                        "font-semibold text-rose-700",
                    )}
                  >
                    <EditableNumber
                      value={e.balGrams}
                      onSave={(n) =>
                        onUpdateEntry(e.id, { balGrams: n })
                      }
                      disabled={rowLocked}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    {e.goldShiftAllocationId ? (
                      <Link
                        href={`/gold/insights/allocations/${e.goldShiftAllocationId}`}
                        className="text-primary hover:underline"
                      >
                        allocation →
                      </Link>
                    ) : e.goldPourId ? (
                      <Link
                        href={`/gold/intake/pours/${e.goldPourId}`}
                        className="text-primary hover:underline"
                      >
                        bare pour →
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {e.buyerReceiptId ? (
                      <Link
                        href={`/gold/settlement/receipts/${e.buyerReceiptId}`}
                        className="ml-2 text-primary hover:underline"
                      >
                        sale →
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusChip
                      status={STATUS_TONE[e.status]}
                      label={e.status}
                    />
                  </td>
                </tr>
                {rowAnomalies.length > 0 ? (
                  <tr className="border-t bg-background/40">
                    <td colSpan={colCount} className="px-2 py-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {rowAnomalies.map((a) => (
                          <AnomalyInlineBadge
                            key={`${a.code}:${a.message}`}
                            anomaly={a}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
                {flagMessage && rowAnomalies.length === 0 ? (
                  <tr
                    className={cn(
                      "border-t",
                      flagSeverity === "danger"
                        ? "bg-rose-50/60"
                        : "bg-amber-50/60",
                    )}
                  >
                    <td colSpan={colCount} className="px-2 py-1.5">
                      <div
                        className={cn(
                          "flex items-start gap-2 text-[11px]",
                          flagSeverity === "danger"
                            ? "text-rose-800"
                            : "text-amber-800",
                        )}
                      >
                        <div>
                          <span className="font-semibold">
                            {flagSeverity === "danger"
                              ? "Failed:"
                              : "Anomaly:"}
                          </span>{" "}
                          {flagMessage}
                          {e.parserWarning &&
                          e.parserWarning !== flagMessage ? (
                            <span className="ml-2 italic opacity-80">
                              (parser: {e.parserWarning})
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot className="sticky bottom-0 bg-muted/80 text-[11px] font-medium backdrop-blur supports-[backdrop-filter]:bg-muted/60">
          {(() => {
            const totals = entries.reduce(
              (acc, e) => {
                const expList = parseExpenses(e.expensesJson);
                const exp = expList.reduce((s, x) => s + x.weight, 0);
                const perType: Record<string, number> = { ...acc.perType };
                for (const t of KNOWN_EXPENSE_TYPES) {
                  const w = expenseWeightFor(t, expList) ?? 0;
                  perType[t] = (perType[t] ?? 0) + w;
                }
                const otherTotal = expList
                  .filter(
                    (x) =>
                      !KNOWN_EXPENSE_TYPES.some(
                        (t) =>
                          t.toLowerCase() === x.type.toLowerCase(),
                      ),
                  )
                  .reduce((s, x) => s + x.weight, 0);
                return {
                  gross: acc.gross + (e.gramsTotal ?? 0),
                  expense: acc.expense + exp,
                  other: acc.other + otherTotal,
                  boys: acc.boys + (e.boysGrams ?? 0),
                  mdara: acc.mdara + (e.mdaraGrams ?? 0),
                  bal:
                    acc.bal +
                    (e.balGrams != null && e.balGrams < 0
                      ? e.balGrams
                      : 0),
                  perType,
                };
              },
              {
                gross: 0,
                expense: 0,
                other: 0,
                boys: 0,
                mdara: 0,
                bal: 0,
                perType: {} as Record<string, number>,
              },
            );
            return (
              <tr className="border-t">
                <td className="px-2 py-2" colSpan={3}>
                  Totals ({entries.length} rows)
                </td>
                <td className="px-2 py-2 text-right">
                  {grams(totals.gross)}
                </td>
                {KNOWN_EXPENSE_TYPES.map((t) => (
                  <td key={t} className="px-2 py-2 text-right">
                    {totals.perType[t] ? grams(totals.perType[t]) : "—"}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  {totals.other > 0 ? grams(totals.other) : "—"}
                </td>
                <td className="px-2 py-2 text-right">
                  {grams(totals.expense)}
                </td>
                <td className="px-2 py-2 text-right text-blue-700">
                  {grams(totals.boys)}
                </td>
                <td className="px-2 py-2 text-right text-emerald-700">
                  {grams(totals.mdara)}
                </td>
                <td className="px-2 py-2 text-right">
                  {grams(totals.mdara + totals.expense)}
                </td>
                <td className="px-2 py-2 text-right text-rose-700">
                  {totals.bal === 0 ? "—" : grams(totals.bal)}
                </td>
                <td className="px-2 py-2" colSpan={2} />
              </tr>
            );
          })()}
        </tfoot>
      </table>
    </div>
  );
}
