import { esc } from "@/lib/documents/html-renderer";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import { depositWords, idCheckWords, levelWords, priceListsWords, productKpis } from "@/lib/retail/products/record-words";
import { loadProductView } from "@/lib/retail/products/view";
import { loadSaleView } from "@/lib/retail/floor/sale-view";
import { paidWords, saleStateLabel } from "@/lib/retail/floor/sale-words";
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
        // A cashier counting her own drawer blind reads no expected figure here either (FLR-04).
        viewer: { user: { id: caller.userId, role: caller.role } },
      });
      if (!shift) return null;
      const xReport = variant === "x-report";
      if (xReport && shift.status !== "OPEN") return "refused";
      const cash = rows([
        ["Opening float", formatMoney(shift.openingFloat)],
        ["Cash sales", formatMoney(shift.cashSales)],
        ["Cash in and out", formatSigned(shift.cashMovementNet)],
        ["Should be in the drawer", shift.expectedCash === null ? "Shows when you close" : formatMoney(shift.expectedCash)],
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
  /** A sale or a refund: its lines, how it was paid and its fiscal receipt, as the record lists them. */
  RetailSale: {
    read: ["retail.sell", "view"],
    render: async (caller, id) => {
      const sale = await loadSaleView(caller.companyId, id, { userId: caller.userId, role: caller.role });
      if (!sale) return null;
      const lines = sale.lines
        .map(
          (line) =>
            `<tr><td>${esc(line.name)}</td><td class="num mono">${line.quantity}</td><td class="num mono">${esc(formatMoney(Number(line.price)))}</td><td class="num mono">${esc(formatMoney(Number(line.discount)))}</td><td class="num mono">${esc(formatMoney(Number(line.total)))}</td></tr>`,
        )
        .join("");
      const paid = rows([
        ...sale.payments.map((payment): [string, string] => [payment.label, formatMoney(Number(payment.amount), payment.currency)]),
        ["Change", formatMoney(Number(sale.change))],
      ]);
      const facts = rows([
        ["Till", sale.till.name],
        ["Cashier", sale.cashier.name],
        ["Customer", sale.customer?.name ?? sale.customerName ?? "Walk-in"],
        ["When", `${formatDay(sale.postedAt)} ${formatTime(sale.postedAt)}`],
        ["State", saleStateLabel(sale.state)],
        ["Fiscal receipt", sale.fiscal.receipt ?? "—"],
      ]);
      return {
        ref: sale.saleNo,
        title: sale.saleNo,
        subtitle: `${sale.till.name} · ${sale.cashier.name} · ${paidWords(sale)}`,
        content: `<table class="rd-table"><caption>Lines</caption><thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Discount</th><th class="num">Line</th></tr></thead><tbody>${lines}<tr><td><b>Total</b></td><td></td><td></td><td></td><td class="num mono"><b>${esc(formatMoney(Number(sale.total)))}</b></td></tr></tbody></table>
<div class="rd-cols">
  <table class="rd-table"><caption>Sale</caption><tbody>${facts}</tbody></table>
  <table class="rd-table"><caption>Paid</caption><tbody>${paid}</tbody></table>
</div>`,
      };
    },
  },
  /** A product: its five figures, then its price, stock and details, as the record's rail lists them. */
  Product: {
    read: ["retail.catalog", "view"],
    render: async (caller, id) => {
      const product = await loadProductView(caller.companyId, id, caller.role);
      if (!product) return null;
      const figures = rows(
        productKpis(product).map((kpi): [string, string] => [
          kpi.label,
          [kpi.value, [kpi.lead, kpi.note].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
        ]),
      );
      const price = rows([
        ["Price", formatMoney(product.price, product.currency)],
        ...(product.cost === null ? [] : ([["Cost", formatMoney(product.cost)]] as Array<[string, string]>)),
        ["VAT", product.vatLabel],
        ["Price lists", priceListsWords(product)],
      ]);
      const stockRows = rows([
        ["On hand", product.stock.onHandLabel],
        ["Reorder at", levelWords(product, "reorderAt", "Never asked")],
        ["Reorder", levelWords(product, "reorderQty", "Not set")],
        ["Supplier", product.supplier?.name ?? "None"],
        ["Sold as", product.soldAs],
      ]);
      const details = rows([
        ["Name", product.name],
        ["Code", product.code],
        ["Barcode", product.barcode ?? "Not on file"],
        ["Category", product.category?.path ?? "None"],
        ["ID check", idCheckWords(product)],
        ...(product.depositsOn ? ([["Deposit", depositWords(product)]] as Array<[string, string]>) : []),
      ]);
      return {
        ref: product.code,
        title: product.name,
        subtitle: `${product.code} · selling at ${formatMoney(product.price, product.currency)}`,
        content: `<table class="rd-table"><caption>The last 30 days</caption><tbody>${figures}</tbody></table>
<div class="rd-cols">
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
