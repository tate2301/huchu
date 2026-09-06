"use client";

/**
 * The end-of-day report, at the till.
 *
 * S-7.2, and the screen `docs/design-system/portals/pos.html` puts under
 * *Reports → End-of-day report* (`renderZReport`, line 2850): a header that says
 * when it was made and that it cannot be changed, a "Locked in" pill, the register
 * and the people who worked it, four KPIs, how customers paid, the best sellers,
 * and a footer of actions.
 *
 * ── Where it departs from the prototype, and why ───────────────────────────
 *
 * - **The VAT is 15%, and it is not typed in anywhere.** The prototype prints
 *   "VAT 14.5%" — Zimbabwe's rate from 2020 to 2022, restored to 15% on 1 January
 *   2023. The figure rendered here is `Σ RetailSale.taxAmount`, the tax actually
 *   charged and already carved out of tax-inclusive shelf prices, and the
 *   percentage beside it is derived back out of the totals. The prototype is a
 *   contract for a screen, not a source of tax facts.
 * - **A register and a day, chosen.** The prototype hard-codes one shift and one
 *   moment. A real till has to be asked *which* register and *which* day, and has
 *   to say when a register's drawer is still open — because a final document over
 *   an unfinished day is a lie that cannot be withdrawn.
 * - **The cash story is here and it is not in the prototype.** Float, takings,
 *   what went to the safe, what came back, expected, counted, variance, per shift.
 *   S-7.1 exists because a day's cash that ignores a drop reads as a shortfall of
 *   exactly what was banked; a Z-report that ignored it would be wrong the same
 *   way.
 * - **Two footer actions, not three.** Export and print ship. "Email to accounts"
 *   does not: there is no outbound mail pipeline for retail in this repository,
 *   and a button that silently does nothing is worse than an absent one.
 *
 * Everything below is read. No figure on this screen is computed in the browser —
 * they were all frozen when the day was closed, which is what makes a reprint
 * identical to the original.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  BarChart3,
  Coins,
  Download,
  Lock,
  Package,
  Printer,
  Receipt,
  Wallet,
} from "@corelithzw/ui/lib/icons";
import {
  RETAIL_CASH_MOVEMENT_LABELS,
  RETAIL_CASH_MOVEMENT_REASON_LABELS,
  type RetailCashMovementReasonCode,
  type RetailCashMovementTypeName,
} from "@/lib/retail/cash-movements";
import {
  PosEmptyState,
  PosMetricCard,
  PosPanel,
  PosPanelHeader,
  PosStatusPill,
} from "./pos-primitives";
import { usePosPortalState } from "./pos-portal-state";
import { money } from "./pos-utils";
import type { TenderType } from "./pos-types";

/* ─── The wire shapes ─────────────────────────────────────────────────────── */

type ZTenderLine = {
  tenderType: TenderType;
  count: number;
  amount: string;
  share: string;
};

type ZItemLine = {
  rank: number;
  itemKey: string;
  itemName: string;
  sku: string | null;
  quantity: string;
  amount: string;
};

type ZMovementLine = {
  type: RetailCashMovementTypeName;
  reasonCode: RetailCashMovementReasonCode;
  count: number;
  amount: string;
};

type ZShiftLine = {
  shiftId: string;
  shiftNo: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  cashTakings: string;
  movementNet: string;
  expectedCash: string;
  countedCash: string | null;
  variance: string | null;
};

type ZReport = {
  id: string;
  reportNo: string;
  businessDate: string;
  registerCode: string;
  registerName: string;
  siteName: string | null;
  currency: string;
  generatedAt: string;
  generatedByName: string | null;
  shiftCount: number;
  saleCount: number;
  refundCount: number;
  voidCount: number;
  itemCount: number;
  grossSales: number;
  discountTotal: number;
  netSales: number;
  taxTotal: number;
  taxRatePercent: number;
  grossTakings: number;
  refundTotal: number;
  voidTotal: number;
  openingFloat: number;
  cashTakings: number;
  cashDropTotal: number;
  cashTopUpTotal: number;
  cashPayoutTotal: number;
  cashMovementNet: number;
  expectedCash: number;
  countedCash: number;
  cashVariance: number;
  tenderBreakdown: ZTenderLine[];
  topItems: ZItemLine[];
  cashMovements: ZMovementLine[];
  shifts: ZShiftLine[];
};

type ZRegisterCandidate = {
  registerCode: string;
  registerName: string;
  shiftCount: number;
  openShiftNo: string | null;
  cashiers: string[];
  reportId: string | null;
  reportNo: string | null;
};

type ZDayPayload = {
  data: { businessDate: string; registers: ZRegisterCandidate[] };
};

/* ─── Labels ──────────────────────────────────────────────────────────────── */

/**
 * The prototype's own words. "Cash · ZWG / USD" says the thing a Harare shop
 * needs said: one drawer, two currencies, and the figure beside it is in the one
 * the books are kept in.
 */
const TENDER_LABEL: Record<TenderType, string> = {
  CASH: "Cash · ZWG / USD",
  CARD: "Card · machine",
  MOBILE_MONEY: "EcoCash / OneMoney",
  TRANSFER: "Bank transfer",
  VOUCHER: "Voucher · store credit",
};

/** The prototype leads with seven of these; the row holds ten. */
const TOP_ITEMS_SHOWN = 7;

function formatMoment(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  })} · ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Trailing zeros off a `Decimal(12,4)` quantity: `42.0000` reads as `42`. */
function formatQuantity(value: string) {
  const asNumber = Number(value);
  return Number.isFinite(asNumber)
    ? asNumber.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : value;
}

/** A stored decimal string, rendered. Never re-summed — see the header. */
function storedMoney(value: string) {
  return money(Number(value));
}

/* ─── Print ───────────────────────────────────────────────────────────────── */

/**
 * The print stylesheet, and it is a real one rather than `print:hidden` sprinkled
 * about.
 *
 * A till renders inside a portal frame with a nav rail, a bottom tab bar and a
 * scrolling body. Printing that gives a page of chrome with the report squeezed
 * into a column. Hiding everything and re-showing one subtree is the only rule
 * that survives a layout the component does not own, and `visibility` rather than
 * `display` is what keeps the subtree's own ancestors from collapsing it.
 */
const PRINT_STYLES = `
@media print {
  body * { visibility: hidden !important; }
  .pos-zreport-sheet, .pos-zreport-sheet * { visibility: visible !important; }
  .pos-zreport-sheet {
    position: absolute !important;
    inset: 0 auto auto 0;
    width: 100%;
    padding: 0;
    border: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
    color: #000 !important;
  }
  .pos-zreport-noprint { display: none !important; }
  .pos-zreport-sheet table { page-break-inside: auto; }
  .pos-zreport-sheet tr { page-break-inside: avoid; }
}
`;

/* ─── Tables ──────────────────────────────────────────────────────────────── */

function ZTable({
  head,
  children,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--edge-default)] text-left text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const CELL = "px-2 py-2 align-top";
const NUM = `${CELL} text-right font-mono tabular-nums`;

/* ─── The report sheet ────────────────────────────────────────────────────── */

function ZReportSheet({ report }: { report: ZReport }) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const cashiers = useMemo(
    () => [...new Set(report.shifts.map((shift) => shift.cashierName))],
    [report.shifts],
  );

  const exportCsv = async () => {
    setExporting(true);
    try {
      // Fetched from the API rather than assembled here, so the spreadsheet holds
      // the stored figures character for character. A second rendering in the
      // browser is a second chance to disagree with the document.
      const res = await fetch(`/api/v2/retail/z-reports/${report.id}?format=csv`);
      if (!res.ok) throw new Error("The export could not be fetched");
      const blob = new Blob([await res.text()], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${report.reportNo}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({ title: "Spreadsheet saved", variant: "success" });
    } catch (error) {
      toast({
        title: "Unable to save the spreadsheet",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const isBalanced = Math.abs(report.cashVariance) < 0.005;

  return (
    <>
      <style>{PRINT_STYLES}</style>

      <PosPanel variant="card" className="pos-zreport-sheet">
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3 border-b border-[var(--edge-subtle)] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {report.reportNo}
            </p>
            <h2 className="mt-1 text-[1.35rem] font-bold tracking-[-0.025em] text-[var(--text-strong)]">
              Z-report — {formatDay(report.businessDate)}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Made on {formatMoment(report.generatedAt)}
              {report.generatedByName ? ` by ${report.generatedByName}` : ""} · final,
              can&rsquo;t be changed
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <PosStatusPill tone="success">
              <Lock className="h-3 w-3" /> Locked in
            </PosStatusPill>
            <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
              {report.registerName} · {report.registerCode}
              {report.siteName ? ` · ${report.siteName}` : ""}
            </p>
            <p className="font-mono text-[11px] text-[var(--text-muted)]">
              {report.shiftCount} shift{report.shiftCount === 1 ? "" : "s"}
              {cashiers.length > 0 ? ` · ${cashiers.join(", ")}` : ""}
            </p>
          </div>
        </div>

        {/* ── KPIs ───────────────────────────────────────── */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <PosMetricCard
            icon={BarChart3}
            label="Sales before discounts"
            value={`${report.currency} ${money(report.grossSales)}`}
            meta={`${report.saleCount} sale${report.saleCount === 1 ? "" : "s"} · excl. VAT`}
            tone="neutral"
          />
          <PosMetricCard
            icon={Receipt}
            label="Discounts given"
            value={`− ${money(report.discountTotal)}`}
            meta="Taken off before VAT"
            tone={report.discountTotal > 0 ? "warning" : "neutral"}
          />
          <PosMetricCard
            icon={Coins}
            label={`VAT ${report.taxRatePercent.toFixed(2)}%`}
            value={money(report.taxTotal)}
            meta="Carved out of the shelf price, not added to it"
            tone="brand"
          />
          <PosMetricCard
            icon={Wallet}
            label="Take-home after discounts"
            value={`${report.currency} ${money(report.grossTakings)}`}
            meta={`Net ${money(report.netSales)} + VAT ${money(report.taxTotal)}`}
            tone="success"
          />
        </div>

        {(report.refundCount > 0 || report.voidCount > 0) && (
          <div className="mt-3 flex flex-wrap gap-4 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-xs text-[var(--text-muted)]">
            <span>
              Refunds{" "}
              <span className="font-mono font-bold tabular-nums text-[var(--text-strong)]">
                {money(report.refundTotal)}
              </span>{" "}
              · {report.refundCount}
            </span>
            <span>
              Cancelled sales{" "}
              <span className="font-mono font-bold tabular-nums text-[var(--text-strong)]">
                {money(report.voidTotal)}
              </span>{" "}
              · {report.voidCount}
            </span>
            <span>
              Already inside the totals above — a cancelled basket and its reversal
              net to nothing.
            </span>
          </div>
        )}

        {/* ── How customers paid ─────────────────────────── */}
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-bold text-[var(--text-strong)]">
            How customers paid{" "}
            <span className="font-normal text-[var(--text-muted)]">
              {report.saleCount} sale{report.saleCount === 1 ? "" : "s"}
            </span>
          </h3>
          {report.tenderBreakdown.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nothing was tendered.</p>
          ) : (
            <ZTable
              head={
                <>
                  <th className={CELL}>How they paid</th>
                  <th className={`${CELL} text-right`}>How many</th>
                  <th className={`${CELL} text-right`}>Amount</th>
                  <th className={`${CELL} text-right`}>Share</th>
                </>
              }
            >
              {report.tenderBreakdown.map((tender) => (
                <tr
                  key={tender.tenderType}
                  className="border-b border-[var(--edge-subtle)] last:border-b-0"
                >
                  <td className={`${CELL} text-[var(--text-strong)]`}>
                    {TENDER_LABEL[tender.tenderType] ?? tender.tenderType}
                  </td>
                  <td className={NUM}>{tender.count}</td>
                  <td className={`${NUM} font-bold text-[var(--text-strong)]`}>
                    {storedMoney(tender.amount)}
                  </td>
                  <td className={NUM}>{tender.share}%</td>
                </tr>
              ))}
            </ZTable>
          )}
        </section>

        {/* ── Best sellers ───────────────────────────────── */}
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-bold text-[var(--text-strong)]">
            Best-selling items{" "}
            <span className="font-normal text-[var(--text-muted)]">
              top {Math.min(TOP_ITEMS_SHOWN, report.topItems.length)} of {report.itemCount}
            </span>
          </h3>
          {report.topItems.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Nothing left the shelf.</p>
          ) : (
            <ZTable
              head={
                <>
                  <th className={CELL}>#</th>
                  <th className={CELL}>Item</th>
                  <th className={`${CELL} text-right`}>How many</th>
                  <th className={`${CELL} text-right`}>Total</th>
                </>
              }
            >
              {report.topItems.map((item) => (
                <tr
                  key={item.itemKey}
                  className="border-b border-[var(--edge-subtle)] last:border-b-0"
                >
                  <td className={`${CELL} font-mono text-[var(--text-muted)]`}>
                    {item.rank}
                  </td>
                  <td className={`${CELL} text-[var(--text-strong)]`}>
                    {item.itemName}
                    {item.sku ? (
                      <span className="ml-2 font-mono text-[11px] text-[var(--text-muted)]">
                        {item.sku}
                      </span>
                    ) : null}
                  </td>
                  <td className={NUM}>{formatQuantity(item.quantity)}</td>
                  <td className={`${NUM} font-bold text-[var(--text-strong)]`}>
                    {storedMoney(item.amount)}
                  </td>
                </tr>
              ))}
            </ZTable>
          )}
        </section>

        {/* ── The cash story ─────────────────────────────── */}
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-bold text-[var(--text-strong)]">
            The drawer{" "}
            <span className="font-normal text-[var(--text-muted)]">
              float, takings, what moved, what was counted
            </span>
          </h3>
          <div className="rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-3 text-sm">
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {[
                ["Opening float", money(report.openingFloat)],
                ["Cash takings", money(report.cashTakings)],
                ["To the safe", `− ${money(report.cashDropTotal)}`],
                ["In from the safe", `+ ${money(report.cashTopUpTotal)}`],
                ["Paid out", `− ${money(report.cashPayoutTotal)}`],
                ["Expected in the drawer", money(report.expectedCash)],
                ["Counted", money(report.countedCash)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-0.5">
                  <dt className="text-[var(--text-muted)]">{label}</dt>
                  <dd className="font-mono tabular-nums text-[var(--text-strong)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex items-center justify-between gap-4 border-t border-[var(--edge-default)] pt-2">
              <span className="text-[13px] font-bold text-[var(--text-strong)]">
                Variance
              </span>
              <PosStatusPill
                tone={isBalanced ? "success" : report.cashVariance > 0 ? "warning" : "danger"}
              >
                <span className="font-mono tabular-nums">
                  {isBalanced
                    ? `Balanced · ${money(0)}`
                    : `${report.cashVariance > 0 ? "Over" : "Short"} ${money(
                        Math.abs(report.cashVariance),
                      )}`}
                </span>
              </PosStatusPill>
            </div>
          </div>

          {report.cashMovements.length > 0 && (
            <div className="mt-3">
              <ZTable
                head={
                  <>
                    <th className={CELL}>Cash moved</th>
                    <th className={CELL}>Why</th>
                    <th className={`${CELL} text-right`}>How many</th>
                    <th className={`${CELL} text-right`}>Amount</th>
                  </>
                }
              >
                {report.cashMovements.map((movement) => (
                  <tr
                    key={`${movement.type}:${movement.reasonCode}`}
                    className="border-b border-[var(--edge-subtle)] last:border-b-0"
                  >
                    <td className={`${CELL} text-[var(--text-strong)]`}>
                      {RETAIL_CASH_MOVEMENT_LABELS[movement.type]}
                    </td>
                    <td className={`${CELL} text-[var(--text-muted)]`}>
                      {RETAIL_CASH_MOVEMENT_REASON_LABELS[movement.reasonCode]}
                    </td>
                    <td className={NUM}>{movement.count}</td>
                    <td className={`${NUM} font-bold text-[var(--text-strong)]`}>
                      {storedMoney(movement.amount)}
                    </td>
                  </tr>
                ))}
              </ZTable>
            </div>
          )}
        </section>

        {/* ── Per shift ──────────────────────────────────── */}
        {report.shifts.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-[13px] font-bold text-[var(--text-strong)]">
              Shift by shift{" "}
              <span className="font-normal text-[var(--text-muted)]">
                a variance belongs to a drawer, not to a day
              </span>
            </h3>
            <ZTable
              head={
                <>
                  <th className={CELL}>Shift</th>
                  <th className={CELL}>Cashier</th>
                  <th className={`${CELL} text-right`}>Expected</th>
                  <th className={`${CELL} text-right`}>Counted</th>
                  <th className={`${CELL} text-right`}>Variance</th>
                </>
              }
            >
              {report.shifts.map((shift) => (
                <tr
                  key={shift.shiftId}
                  className="border-b border-[var(--edge-subtle)] last:border-b-0"
                >
                  <td className={`${CELL} font-mono text-[var(--text-strong)]`}>
                    {shift.shiftNo}
                  </td>
                  <td className={`${CELL} text-[var(--text-muted)]`}>{shift.cashierName}</td>
                  <td className={NUM}>{storedMoney(shift.expectedCash)}</td>
                  <td className={NUM}>
                    {shift.countedCash ? storedMoney(shift.countedCash) : "—"}
                  </td>
                  <td className={`${NUM} font-bold text-[var(--text-strong)]`}>
                    {shift.variance ? storedMoney(shift.variance) : "—"}
                  </td>
                </tr>
              ))}
            </ZTable>
          </section>
        )}

        {/* ── Actions ────────────────────────────────────── */}
        <div className="pos-zreport-noprint mt-6 flex flex-wrap gap-2 border-t border-[var(--edge-subtle)] pt-4">
          <Button
            size="sm"
            variant="outline"
            className="h-12 rounded-xl px-5 text-[14px] font-bold"
            onClick={() => void exportCsv()}
            disabled={exporting}
          >
            <Download className="h-4 w-4" />
            Save as spreadsheet
          </Button>
          <Button
            size="sm"
            className="h-12 rounded-xl px-5 text-[14px] font-bold"
            onClick={() => window.print()}
            style={{
              background: "var(--pos-cta-bg)",
              color: "var(--pos-cta-text)",
              boxShadow: "0 3px 0 var(--pos-cta-shadow)",
            }}
          >
            <Printer className="h-4 w-4" />
            Print Z-report
          </Button>
        </div>
      </PosPanel>
    </>
  );
}

/* ─── The view ────────────────────────────────────────────────────────────── */

export function PosZReportPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentShift, canOverride } = usePosPortalState();

  const [businessDate, setBusinessDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [registerCode, setRegisterCode] = useState<string | null>(null);

  const dayQuery = useQuery({
    queryKey: ["retail-z-report-day", businessDate],
    queryFn: () =>
      fetchJson<ZDayPayload>(
        `/api/v2/retail/z-reports?businessDate=${encodeURIComponent(businessDate)}`,
      ),
    // A cashier is not refused politely at the API — they are refused with a 403.
    // Not asking at all is the honest thing for a screen they cannot use.
    enabled: canOverride,
  });

  const registers = useMemo(
    () => dayQuery.data?.data.registers ?? [],
    [dayQuery.data?.data.registers],
  );
  const selected =
    registers.find((register) => register.registerCode === registerCode) ??
    registers[0] ??
    null;

  const reportQuery = useQuery({
    queryKey: ["retail-z-report", selected?.reportId],
    queryFn: () =>
      fetchJson<{ data: ZReport }>(`/api/v2/retail/z-reports/${selected?.reportId}`),
    enabled: Boolean(selected?.reportId),
  });

  const takeMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ data: ZReport; created: boolean }>("/api/v2/retail/z-reports", {
        method: "POST",
        body: JSON.stringify({
          registerCode: selected?.registerCode,
          businessDate,
        }),
      }),
    onSuccess: (result) => {
      toast({
        title: result.created
          ? `${result.data.reportNo} is locked in`
          : `${result.data.reportNo} had already been taken`,
        description: result.created
          ? "The day's figures are frozen. A reprint will read exactly the same."
          : "One register, one trading day, one report — this is that one.",
        variant: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["retail-z-report-day", businessDate] });
      queryClient.invalidateQueries({ queryKey: ["retail-z-report"] });
    },
    onError: (error) =>
      toast({
        title: "Unable to take the end-of-day report",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  if (!canOverride) {
    return (
      <PosPanel>
        <PosEmptyState
          icon={Lock}
          title="A manager takes the end-of-day report"
          description="It shows every cashier's drawer variance and the shop's takings for the whole day, so it sits with cash control rather than with the till. Ask a manager to open it."
        />
      </PosPanel>
    );
  }

  return (
    <div className="space-y-4">
      <PosPanel>
        <PosPanelHeader
          eyebrow="Reports"
          title="End-of-day report"
          description="One register, one trading day. Taken once and frozen: a reprint next month reads exactly the same, even if a sale has since been cancelled or a price has moved."
          actions={
            <Input
              type="date"
              value={businessDate}
              onChange={(event) => {
                setBusinessDate(event.target.value || businessDate);
                setRegisterCode(null);
              }}
              className="h-12 w-[11rem] font-mono"
              aria-label="Trading day"
            />
          }
        />

        {dayQuery.isLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Looking at the day…</p>
        ) : registers.length === 0 ? (
          <PosEmptyState
            icon={Package}
            title="No till was opened that day"
            description="A Z-report closes a register's trading day, so there has to have been one. Pick another date."
          />
        ) : (
          <div className="space-y-3">
            {registers.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {registers.map((register) => {
                  const isActive = register.registerCode === selected?.registerCode;
                  return (
                    <button
                      key={register.registerCode}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setRegisterCode(register.registerCode)}
                      className="min-h-12 rounded-xl border px-4 text-[13px] font-bold transition-all duration-100 active:translate-y-[2px]"
                      style={
                        isActive
                          ? {
                              background: "var(--pos-cta-bg)",
                              borderColor: "var(--pos-cta-bg)",
                              boxShadow: "0 3px 0 var(--pos-cta-shadow)",
                              color: "var(--pos-cta-text)",
                            }
                          : {
                              background: "var(--pos-key-bg)",
                              borderColor: "var(--pos-key-border)",
                              boxShadow: "0 3px 0 var(--pos-key-shadow)",
                              color: "var(--pos-key-text)",
                            }
                      }
                    >
                      {register.registerName}
                    </button>
                  );
                })}
              </div>
            )}

            {selected && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--edge-subtle)] bg-[var(--surface-muted)] px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-bold text-[var(--text-strong)]">
                    {selected.registerName}
                    <span className="ml-2 font-mono text-[11px] font-normal text-[var(--text-muted)]">
                      {selected.registerCode}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {selected.shiftCount} shift{selected.shiftCount === 1 ? "" : "s"}
                    {selected.cashiers.length > 0
                      ? ` · ${selected.cashiers.join(", ")}`
                      : ""}
                    {selected.reportNo ? ` · ${selected.reportNo}` : ""}
                  </p>
                </div>
                {selected.reportId ? (
                  <PosStatusPill tone="success">
                    <Lock className="h-3 w-3" /> Locked in
                  </PosStatusPill>
                ) : selected.openShiftNo ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <PosStatusPill tone="warning">
                      {selected.openShiftNo} is still open
                    </PosStatusPill>
                    <span className="text-xs text-[var(--text-muted)]">
                      Cash up first — a final document over an unfinished day cannot be
                      withdrawn.
                    </span>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    className="h-12 rounded-xl px-5 text-[14px] font-bold"
                    onClick={() => takeMutation.mutate()}
                    disabled={takeMutation.isPending}
                    style={{
                      background: "var(--pos-cta-bg)",
                      color: "var(--pos-cta-text)",
                      boxShadow: "0 3px 0 var(--pos-cta-shadow)",
                    }}
                  >
                    <Receipt className="h-4 w-4" />
                    Take the end-of-day report
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {currentShift && registers.length > 0 && (
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Your own drawer, {currentShift.shiftNo}, is counted in whichever register it
            was opened on.
          </p>
        )}
      </PosPanel>

      {reportQuery.data?.data ? <ZReportSheet report={reportQuery.data.data} /> : null}
    </div>
  );
}
