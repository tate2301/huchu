import { prisma } from "@/lib/prisma";
import { result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
import { canSeeRetailCostPrice } from "@/lib/retail/permission-matrix";
import { formatDayTime, transferState, unitsWords } from "@/lib/retail/stock/transfer-words";
import { formatMoney } from "@/lib/workspace/format";

/**
 * Transfers (30-stock 4.1, `retail-stock-transfers`): every transfer of the
 * shop, in memory (a shop sends a few a week). Value is Σ sent × the cost each
 * line left at, and only for roles that may see cost.
 */
async function loadTransfers(ctx: ReportContext) {
  const seeCost = canSeeRetailCostPrice(ctx.role);
  const now = new Date();
  const transfers = await prisma.retailStockTransfer.findMany({
    where: { companyId: ctx.companyId },
    orderBy: [{ sentAt: "desc" }, { transferNo: "desc" }],
    take: TAKE,
    select: {
      id: true,
      transferNo: true,
      status: true,
      sentAt: true,
      fromSiteId: true,
      toSiteId: true,
      fromSite: { select: { name: true } },
      toSite: { select: { name: true } },
      lines: {
        select: {
          quantitySent: true,
          quantityReceived: true,
          quantityLost: true,
          unitCost: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  return result(
    transfers.map((transfer): ReportRow => {
      const tally = transfer.lines.reduce(
        (sum, line) => ({
          sent: sum.sent + line.quantitySent.toNumber(),
          received: sum.received + line.quantityReceived.toNumber(),
          lost: sum.lost + line.quantityLost.toNumber(),
          value: sum.value + Math.round(line.quantitySent.toNumber() * line.unitCost.toNumber() * 100),
        }),
        { sent: 0, received: 0, lost: 0, value: 0 },
      );
      const state = transferState(transfer.status, tally);
      const value = tally.value / 100;
      return {
        id: transfer.id,
        transferNo: transfer.transferNo,
        status: transfer.status,
        from: transfer.fromSite.name,
        fromId: transfer.fromSiteId,
        to: transfer.toSite.name,
        toId: transfer.toSiteId,
        route: `${transfer.fromSite.name} to ${transfer.toSite.name}`,
        lines: transfer.lines.length,
        units: tally.sent,
        value: seeCost ? value : null,
        figure: seeCost ? formatMoney(value) : unitsWords(tally.sent),
        sentAt: transfer.sentAt.toISOString(),
        sent: formatDayTime(transfer.sentAt, now),
        state: state.label,
        tone: state.tone,
        products: transfer.lines.map((line) => line.product.name).join(", "),
      };
    }),
  );
}

/** The From and To filters: the shop's sites, open ones and any a transfer names. */
async function transferOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const sites = await prisma.site.findMany({
    where: {
      companyId: ctx.companyId,
      OR: [{ isActive: true }, { retailTransfersOut: { some: {} } }, { retailTransfersIn: { some: {} } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const options = sites.map((site) => ({ value: site.id, label: site.name }));
  return { from: options, to: options };
}

/**
 * A transfer's lines (`retail-stock-transfer-lines`, the `transfer` parent):
 * sent, received (blank until anything of it has been), cost and value at
 * the cost each line left at, for roles that may see cost.
 */
async function loadTransferLines(ctx: ReportContext, params: ReportParams) {
  if (!params.transfer) return result([]);
  const seeCost = canSeeRetailCostPrice(ctx.role);
  const transfer = await prisma.retailStockTransfer.findFirst({
    where: { id: params.transfer, companyId: ctx.companyId },
    select: {
      id: true,
      lines: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          productId: true,
          quantitySent: true,
          quantityReceived: true,
          quantityLost: true,
          unitCost: true,
          product: { select: { name: true } },
        },
      },
    },
  });
  if (!transfer) return result([]);
  const anyReceived = transfer.lines.some((line) => line.quantityReceived.greaterThan(0) || line.quantityLost.greaterThan(0));
  return result(
    transfer.lines.map((line, index): ReportRow => {
      const sent = line.quantitySent.toNumber();
      const received = line.quantityReceived.toNumber();
      return {
        id: line.id,
        transferId: transfer.id,
        productId: line.productId,
        order: index,
        product: line.product.name,
        sent,
        received: anyReceived ? received : null,
        receivedWords: anyReceived ? `${received} received` : "Not received yet",
        cost: seeCost ? line.unitCost.toNumber() : null,
        value: seeCost ? Math.round(sent * line.unitCost.toNumber() * 100) / 100 : null,
      };
    }),
  );
}

export const STOCK_TRANSFER_LOADERS: Record<string, ReportLoader> = {
  "retail-stock-transfers": { load: loadTransfers, options: transferOptions },
  "retail-stock-transfer-lines": { load: loadTransferLines },
};
