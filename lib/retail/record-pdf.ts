import { esc } from "@/lib/documents/html-renderer";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import { ageCheckWords } from "@/lib/retail/products/age-check";
import { loadProductView } from "@/lib/retail/products/view";
import { loadShiftRecord } from "@/lib/retail/shift-record";
import { salesWords, takingsTitle } from "@/lib/retail/shift-words";
import { formatDay, formatMoney, formatSigned, formatTime, formatWhen } from "@/lib/workspace/format";

/**
 * A record as a PDF (W-55 from a record: ⋯ › "Export as PDF"), at
 * `GET /api/v2/retail/records/[type]/[id]/pdf`. Foundations fixes the path and
 * the answer (`application/pdf`, `attachment; filename="<ref>.pdf"`); each
 * record type registers its own renderer here, with the read check of its
 * record. Area specs add theirs.
 */

export type RecordDocument = {
  /** The file name, without `.pdf`: the record's reference. */
  ref: string;
  title: string;
  subtitle: string;
  content: string;
};

type Caller = { companyId: string; userId: string; role: string | null; seesEveryDrawer: boolean };

export type RecordPdfType = {
  read: [RetailResource, RetailAction];
  /** Null when the record is not this company's (or not the caller's). */
  render(caller: Caller, id: string, variant: string | null): Promise<RecordDocument | null | "refused">;
};

function rows(pairs: Array<[string, string]>): string {
  return pairs
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td class="num mono">${esc(value)}</td></tr>`)
    .join("");
}

export const RECORD_DOCUMENT_CSS = `
  .rd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .rd-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
  .rd-table caption { text-align: left; font-weight: 600; padding: 0 0 4px; }
  .rd-table td, .rd-table th { padding: 4px 0; border-bottom: 1px solid var(--rule); text-align: left; }
  .rd-table th { color: var(--ink-muted); font-weight: 500; }
  .rd-table .num { text-align: right; }
  .rd-note { margin: 0 0 14px; font-size: 11px; color: var(--ink-muted); }
`;

const RECORD_PDF: Record<string, RecordPdfType> = {
  /**
   * A shift: its cash up, how people paid and the takings per hour. Printed
   * for an open shift as `?as=x-report`, it is the X-report: the mid-shift
   * read, which changes every time and is not final.
   */
  RetailShift: {
    read: ["retail.cash-control", "view"],
    render: async (caller, id, variant) => {
      const shift = await loadShiftRecord(caller.companyId, id, {
        cashierId: caller.seesEveryDrawer ? undefined : caller.userId,
      });
      if (!shift) return null;
      const xReport = variant === "x-report";
      if (xReport && shift.status !== "OPEN") return "refused";
      const cash = rows([
        ["Opening float", formatMoney(shift.openingFloat)],
        ["Cash sales", formatMoney(shift.cashSales)],
        ["Cash in and out", formatSigned(shift.cashMovementNet)],
        ["Should be in the drawer", formatMoney(shift.expectedCash)],
        ["Counted", shift.countedCash === null ? "Not counted yet" : formatMoney(shift.countedCash)],
        ["Difference", shift.variance === null ? "—" : formatSigned(shift.variance)],
      ]);
      const tenders = rows(shift.tenders.map((line) => [`${line.label} · ${line.sales}`, formatMoney(line.amount)]));
      const hours = rows(shift.takingsOverTime.bars.map((bar) => [bar.label, formatMoney(bar.amount)]));
      const facts = rows([
        ["Till", shift.registerName],
        ["Site", shift.site?.name ?? "—"],
        ["Cashier", shift.cashierName],
        ["Opened", `${formatDay(shift.openedAt)} ${formatTime(shift.openedAt)}`],
        ["Closed", shift.closedAt ? `${formatDay(shift.closedAt)} ${formatTime(shift.closedAt)}` : "Still open"],
        ["Takings", formatMoney(shift.takings)],
        ["Sales", salesWords(shift)],
      ]);
      const now = new Date();
      return {
        ref: xReport ? `${shift.shiftNo}-x-report` : shift.shiftNo,
        title: xReport ? "X-report, not final" : `${shift.registerName} ${shift.shiftNo}`,
        subtitle: xReport
          ? `${shift.registerName} · ${shift.shiftNo} · ${shift.cashierName} · read at ${formatWhen(now)}`
          : `${shift.cashierName} · ${formatDay(shift.openedAt)}`,
        content: `${xReport ? `<p class="rd-note">The drawer is still open: these figures change with every sale until the shift is counted and closed.</p>` : ""}
<div class="rd-cols">
  <table class="rd-table"><caption>Shift</caption><tbody>${facts}</tbody></table>
  <table class="rd-table"><caption>Cash up</caption><tbody>${cash}</tbody></table>
</div>
<div class="rd-cols">
  <table class="rd-table"><caption>How people paid</caption><tbody>${tenders || rows([["Nobody has paid yet", formatMoney(0)]])}</tbody></table>
  <table class="rd-table"><caption>${takingsTitle(shift.takingsOverTime.hoursEach)}</caption><tbody>${hours}</tbody></table>
</div>`,
      };
    },
  },
  /** A product: its price, stock and details, as the record's rail lists them. */
  Product: {
    read: ["retail.catalog", "view"],
    render: async (caller, id) => {
      const product = await loadProductView(caller.companyId, id, caller.role);
      if (!product) return null;
      const price = rows([
        [product.listName, formatMoney(product.price, product.currency)],
        ...(product.cost === null ? [] : ([["Cost", formatMoney(product.cost)]] as Array<[string, string]>)),
        ["VAT", product.vatLabel],
        ...product.otherLists.map((list): [string, string] => [list.name, formatMoney(list.price, list.currency)]),
        ["Most off", product.maxDiscountPercent === null ? "No limit" : `${product.maxDiscountPercent}%`],
      ]);
      const stock = product.stock;
      const stockRows = rows([
        ["On hand", stock.onHandLabel],
        ["Reorder at", stock.reorderAt === null ? "—" : `${stock.reorderAt} ${product.unit}`],
        ["Reorder", stock.reorderQty === null ? "—" : `${stock.reorderQty} ${product.unit}`],
      ]);
      const details = rows([
        ["Name", product.name],
        ["Code", product.code],
        ["Barcode", product.barcode ?? "—"],
        ["Category", product.category?.path ?? "—"],
        ["Supplier", product.supplier?.name ?? "—"],
        ["ID check", ageCheckWords(product.ownAgeCheck, product.category)],
        ["Deposit", product.returnable && product.depositAmount ? formatMoney(product.depositAmount) : "None"],
      ]);
      return {
        ref: product.code,
        title: product.name,
        subtitle: product.code,
        content: `<div class="rd-cols">
  <table class="rd-table"><caption>Price</caption><tbody>${price}</tbody></table>
  <table class="rd-table"><caption>Stock</caption><tbody>${stockRows}</tbody></table>
</div>
<table class="rd-table"><caption>Details</caption><tbody>${details}</tbody></table>`,
      };
    },
  },
};

export function recordPdfType(type: string): RecordPdfType | null {
  return Object.prototype.hasOwnProperty.call(RECORD_PDF, type) ? RECORD_PDF[type]! : null;
}
