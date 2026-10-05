import { prisma } from "@/lib/prisma";
import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportRow } from "@/lib/reports/types";
import { TILL_STATE_TONES, TILL_STATE_WORDS } from "@/lib/retail/till-words";
import { listTills } from "@/lib/retail/tills";

/**
 * Tills and devices (10-setup 4.3, `retail-tills`): every working till,
 * through the same reader as `GET /tills`. Nobody on it reads "Nobody",
 * muted.
 */
async function loadTills(ctx: ReportContext) {
  const { data } = await listTills(ctx.companyId);
  return result(
    data.map(
      (till): ReportRow => ({
        id: till.id,
        name: till.name,
        code: till.code,
        siteId: till.site.id,
        site: till.site.name,
        device: till.device,
        lastSale: till.lastSale,
        lastSaleAt: till.lastSaleAt,
        // The phone card: "Last sale Today, 11:42", or "No sale yet".
        lastSaleCard: till.lastSale ? `Last sale ${till.lastSale}` : "No sale yet",
        onItNow: till.onItNow ?? "Nobody",
        state: till.stateLabel,
        stateKey: till.state,
        stateTone: TILL_STATE_TONES[till.state],
        stateWord: TILL_STATE_WORDS[till.state],
      }),
    ),
  );
}

async function tillOptions(ctx: ReportContext) {
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return { site: sites.map((site) => ({ value: site.id, label: site.name })) };
}

export const TILL_LOADERS: Record<string, ReportLoader> = {
  "retail-tills": { load: loadTills, options: tillOptions },
};
