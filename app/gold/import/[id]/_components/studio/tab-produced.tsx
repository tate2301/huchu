"use client";

import Link from "next/link";
import { ClientDate } from "@/app/gold/components/client-date";
import { ExternalLink } from "@/lib/icons";
import type { LedgerEntry } from "../types";

function EmptyState({ committed, label }: { committed: boolean; label: string }) {
  if (!committed) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[--text-muted]">
        <p>
          No {label} yet. Commit the import to produce records.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[--text-muted]">
      <p>No {label} produced by this import.</p>
    </div>
  );
}

export function TabProducedPours({
  entries,
  isCommitted,
}: {
  entries: LedgerEntry[];
  isCommitted: boolean;
}) {
  const pourEntries = entries.filter((e) => e.goldPourId);

  return (
    <div className="p-6">
      <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">
            Pours ({pourEntries.length})
          </h2>
          <p className="mt-0.5 text-xs text-[--text-muted]">
            Gold batches produced by this import.
          </p>
        </header>
        {pourEntries.length === 0 ? (
          <EmptyState committed={isCommitted} label="pours" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[--surface-muted]">
                <tr>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Row</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Leader</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Date</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Gross (g)</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--border]">
                {pourEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-[--surface-muted]/50">
                    <td className="px-4 py-3 font-mono text-[--text-muted]">#{e.lineNo}</td>
                    <td className="px-4 py-3 text-[--text-strong]">{e.parsedName ?? "—"}</td>
                    <td className="px-4 py-3 font-mono">
                      {e.parsedDate ? (
                        <ClientDate value={e.parsedDate} mode="date" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {e.gramsTotal != null ? e.gramsTotal.toFixed(3) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.goldPourId && (
                        <Link
                          href={`/gold/intake/pours/${e.goldPourId}`}
                          className="inline-flex items-center gap-1 text-xs text-[--action-primary-bg] hover:underline"
                        >
                          View pour
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TabProducedReceipts({
  entries,
  isCommitted,
}: {
  entries: LedgerEntry[];
  isCommitted: boolean;
}) {
  const receiptEntries = entries.filter((e) => e.buyerReceiptId);

  return (
    <div className="p-6">
      <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">
            Receipts ({receiptEntries.length})
          </h2>
          <p className="mt-0.5 text-xs text-[--text-muted]">
            Buyer receipts / sales produced by this import.
          </p>
        </header>
        {receiptEntries.length === 0 ? (
          <EmptyState committed={isCommitted} label="receipts" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[--surface-muted]">
                <tr>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Row</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Leader</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Date</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Bal (g)</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--border]">
                {receiptEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-[--surface-muted]/50">
                    <td className="px-4 py-3 font-mono text-[--text-muted]">#{e.lineNo}</td>
                    <td className="px-4 py-3 text-[--text-strong]">{e.parsedName ?? "—"}</td>
                    <td className="px-4 py-3 font-mono">
                      {e.parsedDate ? (
                        <ClientDate value={e.parsedDate} mode="date" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {e.balGrams != null ? e.balGrams.toFixed(3) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.buyerReceiptId && (
                        <Link
                          href={`/gold/settlement/receipts/${e.buyerReceiptId}`}
                          className="inline-flex items-center gap-1 text-xs text-[--action-primary-bg] hover:underline"
                        >
                          View receipt
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TabProducedAllocations({
  entries,
  isCommitted,
}: {
  entries: LedgerEntry[];
  isCommitted: boolean;
}) {
  const allocEntries = entries.filter((e) => e.goldShiftAllocationId);

  return (
    <div className="p-6">
      <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">
            Shift allocations ({allocEntries.length})
          </h2>
          <p className="mt-0.5 text-xs text-[--text-muted]">
            Worker shift allocations produced by this import.
          </p>
        </header>
        {allocEntries.length === 0 ? (
          <EmptyState committed={isCommitted} label="allocations" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[--surface-muted]">
                <tr>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Row</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Leader / Group</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Date</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Workers (g)</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Company (g)</th>
                  <th className="border-b border-[--border] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[--text-muted]">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--border]">
                {allocEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-[--surface-muted]/50">
                    <td className="px-4 py-3 font-mono text-[--text-muted]">#{e.lineNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[--text-strong]">{e.parsedName ?? "—"}</div>
                      {e.shiftGroup && (
                        <div className="text-xs text-[--text-muted]">{e.shiftGroup.name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {e.parsedDate ? (
                        <ClientDate value={e.parsedDate} mode="date" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-sky-800">
                      {e.boysGrams != null ? e.boysGrams.toFixed(3) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-800">
                      {e.mdaraGrams != null ? e.mdaraGrams.toFixed(3) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {e.goldShiftAllocationId && (
                        <Link
                          href={`/gold/insights/allocations/${e.goldShiftAllocationId}`}
                          className="inline-flex items-center gap-1 text-xs text-[--action-primary-bg] hover:underline"
                        >
                          View allocation
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TabProducedDispatches({ isCommitted }: { isCommitted: boolean }) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">Dispatches</h2>
        </header>
        <EmptyState committed={isCommitted} label="dispatches" />
      </div>
    </div>
  );
}

export function TabProducedPayouts({ isCommitted }: { isCommitted: boolean }) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">Payouts</h2>
        </header>
        <EmptyState committed={isCommitted} label="payouts" />
      </div>
    </div>
  );
}

export function TabExceptions({ isCommitted }: { isCommitted: boolean }) {
  return (
    <div className="p-6">
      <div className="rounded-lg border border-[--border] bg-[--surface-base] overflow-hidden">
        <header className="border-b border-[--border] bg-[--surface-muted] px-4 py-3">
          <h2 className="text-sm font-semibold text-[--text-strong]">Exceptions</h2>
          <p className="mt-0.5 text-xs text-[--text-muted]">
            Gold exceptions linked to this import.
          </p>
        </header>
        <EmptyState committed={isCommitted} label="exceptions" />
      </div>
    </div>
  );
}
