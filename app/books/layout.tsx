import { getServerSession } from "next-auth";
import type { ReactNode } from "react";

import { BkUpsellView } from "@/components/books/bk-upsell-view";
import { BooksScreensGate } from "@/components/books/books-screens-gate";
import { authOptions } from "@/lib/auth";
import { readUpsellFacts, upsellView } from "@/lib/books/upsell";
import { hasEnabledFeature } from "@/lib/platform/gating/enforcer";
import { BOOKS_SCREENS_KEY } from "@/lib/platform/gating/route-registry";
import { prisma } from "@/lib/prisma";

/**
 * Books' pages are the paid screens (`books.screens`, books-final §1.2, D1).
 * Without them every Books address shows BkUpsell in place of its page, with
 * the books' own figures from the core; the engine posts either way.
 */
export default async function BooksLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.companyId || hasEnabledFeature(user.enabledFeatures, BOOKS_SCREENS_KEY)) return children;
  const now = new Date();
  const view = upsellView(await readUpsellFacts(prisma, user.companyId, now), user.role, now);
  return <BooksScreensGate upsell={<BkUpsellView view={view} />}>{children}</BooksScreensGate>;
}
