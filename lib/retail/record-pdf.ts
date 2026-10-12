import { esc } from "@/lib/documents/html-renderer";
import { multiplyMoney, sumMoney } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { canSeeRetailCostPrice } from "@/lib/retail/permission-matrix";
import { COUNT_STATE } from "@/lib/retail/stock/count-words";
import { hidesExpected } from "@/lib/retail/stock/counts";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import { depositWords, idCheckWords, levelWords, priceListsWords, productKpis } from "@/lib/retail/products/record-words";
import { loadProductView } from "@/lib/retail/products/view";
import { loadBundleView } from "@/lib/retail/bundles/service";
import { loadPromotionView, promotionProductRows } from "@/lib/retail/promotions/service";
import { loadVoucherView, voucherUseRows } from "@/lib/retail/vouchers/service";
import { customerSpendChart } from "@/lib/retail/customers/spend-chart";
import { loadCustomerRecord } from "@/lib/retail/customers/view";
import { signedPoints } from "@/lib/retail/loyalty/format";
import { loadSaleView } from "@/lib/retail/floor/sale-view";
import { renderDeliveryNotePdf, renderOrderPdf, renderRequisitionPdf } from "@/lib/retail/buying/documents";
import { pointsKindLabel } from "@/lib/retail/words";
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
  /** A second grant that also reads it, its row rule kept by `render` (a cashier's own requisition). */
  alsoRead?: [RetailResource, RetailAction];
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
  /** A requisition (40-buying 4.10); `?sign=1` adds the boxes to sign. A cashier or stock clerk reads only their own. */
  CrmRequisition: {
    read: ["retail.requisitions", "view"],
    alsoRead: ["retail.requisitions", "view-own"],
    render: (caller, id, variant) =>
      renderRequisitionPdf({ companyId: caller.companyId, userId: caller.userId, userRole: caller.role }, id, variant === "sign"),
  },
  /** A purchase order as the supplier gets it (40-buying 4.10); also opened by a message's signed link. */
  RetailPurchaseOrder: {
    read: ["retail.purchasing", "view"],
    render: (caller, id) => renderOrderPdf(caller.companyId, id),
  },
  /** A delivery note: what came, what broke and what went into stock (40-buying 4.10). */
  RetailGoodsReceipt: {
    read: ["retail.purchasing", "view"],
    render: (caller, id) => renderDeliveryNotePdf(caller.companyId, id),
  },
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
  /** A bundle or buy-more deal (PRD-08): its figures, what is in it, and how it sells. */
  RetailBundle: {
    read: ["retail.promotions", "view"],
    render: async (caller, id) => {
      const bundle = await loadBundleView(caller.companyId, id, caller.role);
      if (!bundle) return null;
      const figures = rows([
        ["Sold, 30 days", String(bundle.sold30)],
        ["Takings, 30 days", formatMoney(bundle.takings30)],
        ...(bundle.margin === null ? [] : ([["Margin", `${bundle.margin.toFixed(1)}%`]] as Array<[string, string]>)),
        ["Can make", bundle.canMake === null ? "—" : String(bundle.canMake)],
        ["Saves", formatMoney(bundle.saves)],
      ]);
      const items = bundle.items
        .map(
          (item) =>
            `<tr><td>${esc(item.name)}</td><td class="num mono">${item.quantity}</td><td class="num mono">${esc(formatMoney(item.each * item.quantity))}</td><td class="num mono">${item.onHand}</td></tr>`,
        )
        .join("");
      const selling = rows([
        ["Price", formatMoney(bundle.price)],
        ["On sale", bundle.daysLabel],
        ["Until", bundle.untilLabel],
        ["Sites", bundle.site?.name ?? "All sites"],
        ["Barcode", bundle.barcode ?? "None"],
      ]);
      return {
        ref: bundle.code,
        title: bundle.name,
        subtitle: `${bundle.code} · ${bundle.kindLabel} · ${formatMoney(bundle.price)}`,
        content: `<table class="rd-table"><caption>The last 30 days</caption><tbody>${figures}</tbody></table>
<table class="rd-table"><caption>What is in it</caption><thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">On their own</th><th class="num">On hand</th></tr></thead><tbody>${items}</tbody></table>
<table class="rd-table"><caption>Selling</caption><tbody>${selling}</tbody></table>`,
      };
    },
  },
  /** A promotion (PRD-09): what it did, the products it covers, and its rules. */
  RetailPromotion: {
    read: ["retail.promotions", "view"],
    render: async (caller, id) => {
      const promotion = await loadPromotionView(caller.companyId, id);
      if (!promotion) return null;
      const f = promotion.figures;
      const figures = rows([
        ["Sold under it", String(f.soldUnder)],
        ["Extra takings", formatMoney(f.extraTakings)],
        ["Given away", formatMoney(f.givenAway)],
        ["Products", `${f.products}, ${f.notSold} not sold yet`],
        ["Running for", promotion.state === "SCHEDULED" ? "Not started" : `${f.runningDays} days`],
      ]);
      const products = (await promotionProductRows(caller.companyId, id, caller.role)) ?? [];
      const lines = products
        .map(
          (row) =>
            `<tr><td>${esc(row.name)}</td><td class="num mono">${esc(row.normal === null ? "—" : formatMoney(row.normal))}</td><td class="num mono">${esc(row.onPromotion === null ? "—" : formatMoney(row.onPromotion))}</td><td class="num mono">${row.sold}</td><td class="num mono">${esc(formatMoney(row.givenAway))}</td></tr>`,
        )
        .join("");
      const rules = rows([
        ["Type", promotion.kindLabel],
        ["Value", promotion.valueLabel],
        ["Applies to", promotion.appliesToLabel],
        ["Basket", promotion.minBasket === null ? "Any size" : formatMoney(promotion.minBasket)],
        ["Days", promotion.days],
        ["Starts", formatWhen(promotion.startsAt)],
        ["Ends", promotion.endsAt ? formatWhen(promotion.endsAt) : "No end date"],
        ["Sites", promotion.site?.name ?? "All sites"],
      ]);
      return {
        ref: promotion.code,
        title: promotion.name,
        subtitle: `${promotion.code} · ${promotion.badge.label} · ${promotion.valueLabel}`,
        content: `<table class="rd-table"><caption>What it did</caption><tbody>${figures}</tbody></table>
<table class="rd-table"><caption>Products</caption><thead><tr><th>Product</th><th class="num">Normal</th><th class="num">On promotion</th><th class="num">Sold</th><th class="num">Given away</th></tr></thead><tbody>${lines}</tbody></table>
<table class="rd-table"><caption>Rules</caption><tbody>${rules}</tbody></table>`,
      };
    },
  },
  RetailVoucher: {
    read: ["retail.promotions", "view"],
    render: async (caller, id) => {
      // The secret stays off paper that is not a voucher card.
      const voucher = await loadVoucherView(caller.companyId, id, false);
      if (!voucher) return null;
      const details = rows([
        ["Kind", voucher.kindLabel],
        ["Holder", voucher.holder],
        ["Value", voucher.valueLabel],
        ["Left", voucher.leftLabel],
        ["Spent", `${formatMoney(voucher.spent)}, ${voucher.uses} ${voucher.uses === 1 ? "time" : "times"}`],
        ["Issued", formatDay(voucher.issuedAt)],
        ["Expires", formatDay(voucher.expiresOn)],
        ["Sites", voucher.site],
        ...(voucher.soldSale ? ([["Sale", `${voucher.soldSale.saleNo}, ${voucher.soldSale.paidWith}`]] as Array<[string, string]>) : []),
        ...(voucher.voidReason ? ([["Voided", voucher.voidReason]] as Array<[string, string]>) : []),
      ]);
      const uses = (await voucherUseRows(caller.companyId, id))
        .map(
          (use) =>
            `<tr><td class="mono">${esc(use.saleNo)}</td><td>${esc(formatDay(use.at))}</td><td>${esc(use.till)}</td><td class="num mono">${esc(formatMoney(use.spent))}</td><td class="num mono">${esc(use.leftAfter === null ? "—" : formatMoney(use.leftAfter))}</td></tr>`,
        )
        .join("");
      return {
        ref: voucher.code,
        title: `${voucher.kindLabel} ${voucher.code}`,
        subtitle: `${voucher.code} · ${voucher.stateLabel} · ${voucher.leftLabel} left`,
        content: `<table class="rd-table"><caption>Voucher</caption><tbody>${details}</tbody></table>
<table class="rd-table"><caption>Uses</caption><thead><tr><th>Sale</th><th>When</th><th>Till</th><th class="num">Spent</th><th class="num">Left after</th></tr></thead><tbody>${uses}</tbody></table>`,
      };
    },
  },
  /**
   * A customer (CUS-03): who they are, their five figures, spend per month for
   * 12 months as a table, the points ledger of those 12 months with its
   * running balance, and the rail's values.
   */
  Customer: {
    read: ["retail.customers", "view"],
    render: async (caller, id) => {
      const customer = await loadCustomerRecord(caller.companyId, id, { update: false, delete: false, activity: false });
      if (!customer) return null;
      const now = new Date();
      const from = new Date(now.getTime() - 365 * 86_400_000);
      const [chart, entries, before] = await Promise.all([
        customerSpendChart(caller.companyId, id, "12m", now),
        prisma.retailPointsEntry.findMany({
          where: { companyId: caller.companyId, customerId: id, createdAt: { gte: from } },
          orderBy: [{ createdAt: "asc" }, { seq: "asc" }],
          select: { createdAt: true, kind: true, points: true, reason: true, actorName: true, sale: { select: { saleNo: true } } },
        }),
        prisma.retailPointsEntry.aggregate({ where: { companyId: caller.companyId, customerId: id, createdAt: { lt: from } }, _sum: { points: true } }),
      ]);
      const chips = [
        customer.tier.name ? (customer.tier.heldUntil ? `${customer.tier.name}, held` : customer.tier.name) : null,
        `Member since ${formatDay(customer.memberSince)}`,
        customer.marketingConsent ? "Agreed to messages" : null,
        customer.staff ? "Staff" : null,
      ].filter(Boolean);
      const figures = rows(
        customer.kpis.map((kpi): [string, string] => [kpi.label, [kpi.value, [kpi.lead, kpi.note].filter(Boolean).join(" ")].filter(Boolean).join(" · ")]),
      );
      const months = rows(chart.bars.map((bar): [string, string] => [bar.tip, formatMoney(bar.value)]));
      let running = before._sum.points ?? 0;
      const ledger = entries
        .map((entry) => {
          running += entry.points;
          return `<tr><td class="mono">${esc(formatWhen(entry.createdAt))}</td><td>${esc(pointsKindLabel(entry).label)}</td><td class="mono">${esc(entry.sale?.saleNo ?? "—")}</td><td>${esc(entry.actorName ?? "Automatic")}</td><td class="num mono">${esc(signedPoints(entry.points))}</td><td class="num mono">${running.toLocaleString("en-US")}</td></tr>`;
        })
        .reverse()
        .join("");
      const contact = rows([
        ["Phone", customer.phoneDisplay || "—"],
        ["WhatsApp", customer.whatsappDisplay ?? "Same number"],
        ["Email", customer.email ?? "—"],
        ["Area", customer.area ?? "—"],
      ]);
      const loyalty = rows([
        ["Earns", customer.loyalty.earns],
        ["Worth", customer.loyalty.worth],
        ["Card", customer.cardNo ?? "—"],
        ["Expiry", customer.loyalty.expiry],
        ["Most", customer.usually.most],
        ["Then", customer.usually.then],
        ["Pays with", customer.usually.paysWith],
      ]);
      return {
        ref: customer.code ?? customer.name,
        title: customer.name,
        subtitle: [customer.code, ...chips, `Points ${customer.points.balance.toLocaleString("en-US")}`].filter(Boolean).join(" · "),
        content: `<table class="rd-table"><caption>The last 12 months</caption><tbody>${figures}</tbody></table>
<p class="rd-note">${esc(customer.meter.label)} · ${esc(customer.meter.value)}. ${esc(customer.meter.note)}</p>
<div class="rd-cols">
  <table class="rd-table"><caption>Spend per month</caption><tbody>${months}</tbody></table>
  <div>
    <table class="rd-table"><caption>Contact</caption><tbody>${contact}</tbody></table>
    <table class="rd-table"><caption>Loyalty</caption><tbody>${loyalty}</tbody></table>
  </div>
</div>
<table class="rd-table"><caption>Points ledger, 12 months</caption><thead><tr><th>When</th><th>What</th><th>Receipt</th><th>By</th><th class="num">Points</th><th class="num">Balance</th></tr></thead><tbody>${ledger}</tbody></table>`,
      };
    },
  },
  /**
   * A stock count (STK-06): its figures and every line, expected, counted and
   * the difference; the value at cost only for roles that see cost.
   */
  RetailStockCount: {
    read: ["retail.counts", "view"],
    render: async (caller, id) => {
      const count = await prisma.retailStockCount.findFirst({
        where: { id, companyId: caller.companyId },
        select: {
          countNo: true,
          name: true,
          status: true,
          blind: true,
          counterId: true,
          createdAt: true,
          submittedAt: true,
          approvedAt: true,
          site: { select: { name: true } },
          counter: { select: { name: true } },
          approvedBy: { select: { name: true } },
          lines: {
            orderBy: [{ sortKey: "asc" }, { id: "asc" }],
            select: {
              expected: true,
              expectedAtCount: true,
              counted: true,
              difference: true,
              unitCost: true,
              inventoryItem: { select: { name: true, product: { select: { name: true } } } },
            },
          },
        },
      });
      if (!count) return null;
      // The counter of a blind count, while counting, sees what they counted
      // and nothing to compare it with: no expected, no difference, no value.
      const blindToCaller = hidesExpected(caller, count);
      const seeCost = canSeeRetailCostPrice(caller.role ?? "") && !blindToCaller;
      const valued = count.lines.map((line) => ({
        line,
        value: line.difference ? multiplyMoney(line.difference, line.unitCost).toNumber() : 0,
      }));
      const differing = valued.filter(({ line }) => line.difference && !line.difference.isZero());
      const net = sumMoney(differing.map(({ value }) => value)).toNumber();
      const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
      const figures = rows([
        ["Lines", String(count.lines.length)],
        ...(blindToCaller ? [] : ([["Differ", String(differing.length)]] as Array<[string, string]>)),
        ...(seeCost ? ([["Difference at cost", formatSigned(net)]] as Array<[string, string]>) : []),
        ["Site", count.site.name],
        ["Counted by", count.counter.name],
        ["Blind", count.blind ? "Yes" : "No"],
        ["Started", formatWhen(count.createdAt)],
        ["Finished", count.submittedAt ? formatWhen(count.submittedAt) : "—"],
        ...(count.approvedAt ? ([["Approved", `${formatWhen(count.approvedAt)}, ${count.approvedBy?.name ?? ""}`]] as Array<[string, string]>) : []),
      ]);
      const lines = valued
        .map(({ line, value }) => {
          const expected = (line.expectedAtCount ?? line.expected).toNumber();
          const cells = [
            `<td>${esc(line.inventoryItem.product?.name ?? line.inventoryItem.name)}</td>`,
            ...(blindToCaller ? [] : [`<td class="num mono">${expected}</td>`]),
            `<td class="num mono">${line.counted === null ? "—" : line.counted.toNumber()}</td>`,
            ...(blindToCaller ? [] : [`<td class="num mono">${line.difference === null ? "—" : esc(signed(line.difference.toNumber()))}</td>`]),
            ...(seeCost ? [`<td class="num mono">${line.difference === null ? "—" : esc(formatSigned(value))}</td>`] : []),
          ];
          return `<tr>${cells.join("")}</tr>`;
        })
        .join("");
      return {
        ref: count.countNo,
        title: count.name,
        subtitle: `${count.countNo} · ${COUNT_STATE[count.status].label} · ${count.site.name}`,
        content: `<table class="rd-table"><caption>The count</caption><tbody>${figures}</tbody></table>
<table class="rd-table"><caption>Every line</caption><thead><tr><th>Product</th>${blindToCaller ? "" : '<th class="num">Expected</th>'}<th class="num">Counted</th>${blindToCaller ? "" : '<th class="num">Difference</th>'}${seeCost ? '<th class="num">Value</th>' : ""}</tr></thead><tbody>${lines}</tbody></table>`,
      };
    },
  },
};

export function recordPdfType(type: string): RecordPdfType | null {
  return Object.prototype.hasOwnProperty.call(RECORD_PDF, type) ? RECORD_PDF[type]! : null;
}
