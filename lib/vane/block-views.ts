import type { PrismaClient } from "@prisma/client";

import { vaneQuoteView } from "@/lib/crm/knowledge/vane-quote";

import type { VaneBlock, VaneBlockView } from "./blocks";

/** An answer's blocks as the panel draws them: a quote filled in from the quote as it stands, or said to be gone. */
export async function blockViews(db: Pick<PrismaClient, "salesQuotation" | "crmLeadDocument">, companyId: string, blocks: VaneBlock[]): Promise<VaneBlockView[]> {
  return Promise.all(
    blocks.map(async (block): Promise<VaneBlockView> => {
      if (block.kind !== "quote") return block;
      return (await vaneQuoteView(db, companyId, block.quotationId)) ?? { kind: "gone", what: "The quote Vane drafted" };
    }),
  );
}
