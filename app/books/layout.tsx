import { getServerSession } from "next-auth";
import type { ReactNode } from "react";

import { BkPlanGate } from "@/components/books/bk-plan-gate";
import { BooksGlyphs } from "@/components/books/icons/register-glyphs";
import { authOptions } from "@/lib/auth";
import { booksPlanOf } from "@/lib/books/tiers";
import { readUpsellFacts, upsellView } from "@/lib/books/upsell";
import { prisma } from "@/lib/prisma";

/**
 * Every Books address, on every plan. Free addresses (selling, buying,
 * paying, staff money, money accounts) show their page in every workspace;
 * a paid one shows what its plan adds in its place (lib/books/tiers.ts,
 * design/books/NOTES.md §1). The engine posts either way.
 */
export default async function BooksLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const plan = booksPlanOf(user?.enabledFeatures);
  // The upsell's figures are read only where some address can show it.
  const facts =
    plan !== "advanced" && user?.companyId ? upsellView(await readUpsellFacts(prisma, user.companyId), user.role) : { finding: { fact: "Your books are ready.", rest: "" }, canAdd: false };
  return (
    <>
      <BooksGlyphs />
      <BkPlanGate plan={plan} facts={facts}>
        {children}
      </BkPlanGate>
    </>
  );
}
