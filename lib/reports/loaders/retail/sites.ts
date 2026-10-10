import { result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportRow } from "@/lib/reports/types";
import { canSeeRetailCostPrice } from "@/lib/retail/permission-matrix";
import { SITE_STATE_WORDS, tillWords } from "@/lib/retail/site-words";
import { listSites } from "@/lib/retail/sites";

/**
 * Sites (10-setup 4.2, `retail-sites`): every site, open and closed — the
 * State filter narrows them — through the same reader as `GET /sites`.
 */
async function loadSites(ctx: ReportContext) {
  const { data } = await listSites(ctx.companyId, { state: "any", canSeeCost: canSeeRetailCostPrice(ctx.role) });
  return result(
    data.map(
      (site): ReportRow => ({
        id: site.id,
        name: site.name,
        code: site.code,
        places: site.places,
        tills: site.tills,
        priceList: site.priceList,
        stockValue: site.stockValue === null ? null : Number(site.stockValue),
        state: SITE_STATE_WORDS[site.state],
        // The phone card's second line: "3 tills".
        tillWords: tillWords(site.tills),
      }),
    ),
  );
}

export const SITE_LOADERS: Record<string, ReportLoader> = {
  "retail-sites": { load: loadSites },
};
