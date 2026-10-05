import { prisma } from "@/lib/prisma";
import { result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
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

export const STOCK_TRANSFER_LOADERS: Record<string, ReportLoader> = {
  "retail-stock-transfers": { load: loadTransfers, options: transferOptions },
};
