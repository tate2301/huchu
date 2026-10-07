import { canRetailSessionDo, type RetailAction, type RetailResource, type SessionLike } from "@/lib/retail/permission-matrix";

import { waitedWords } from "./words";

/**
 * "Waiting now" on Approvals (80-admin 4.2): what waits for someone's yes,
 * from providers each area registers — BUY-04 requisitions asked, STK-06
 * counts to approve, CUS-07 accounts waiting, ADM-05 price changes. Only the
 * providers whose `requires` the caller holds run. Oldest first, five at most,
 * and how many more.
 */

export type WaitingKind = "requisition" | "count" | "account" | "prices";

export type WaitingCtx = { companyId: string; userId: string; session: SessionLike; now: Date };

/**
 * One thing waiting, as its provider words it: `ref` is the record's
 * reference, drawn as the link ("REQ-0014"); `text` what follows it
 * (", US$1,940.00, for Afdis."); the age is added after.
 */
export type WaitingEntry = { key: string; ref: string; text: string; href: string; since: Date };

export type WaitingProvider = {
  kind: WaitingKind;
  requires: [RetailResource, RetailAction];
  list(ctx: WaitingCtx): Promise<WaitingEntry[]>;
};

/** One line of the aside: "REQ-0014, US$1,940.00, for Afdis. 3 hours." */
export type WaitingItem = {
  key: string;
  kind: WaitingKind;
  ref: string;
  text: string;
  href: string;
  since: string;
};

export type WaitingAnswer = { items: WaitingItem[]; more: number };

export const WAITING_SHOWN = 5;

const PROVIDERS: WaitingProvider[] = [];

/** An area adds its provider once, from `lib/retail/approvals/providers.ts`. */
export function registerWaitingProvider(provider: WaitingProvider): void {
  if (!PROVIDERS.some((known) => known.kind === provider.kind)) PROVIDERS.push(provider);
}

export async function listWaiting(ctx: WaitingCtx, providers: WaitingProvider[] = PROVIDERS): Promise<WaitingAnswer> {
  const allowed = providers.filter((provider) => canRetailSessionDo(ctx.session, provider.requires[0], provider.requires[1]));
  const lists = await Promise.all(
    allowed.map(async (provider) => (await provider.list(ctx)).map((entry) => ({ ...entry, kind: provider.kind }))),
  );
  const all = lists
    .flat()
    .sort((a, b) => a.since.getTime() - b.since.getTime() || a.key.localeCompare(b.key));
  return {
    items: all.slice(0, WAITING_SHOWN).map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      ref: entry.ref,
      text: `${entry.ref}${entry.text} ${waitedWords(entry.since, ctx.now)}.`,
      href: entry.href,
      since: entry.since.toISOString(),
    })),
    more: Math.max(0, all.length - WAITING_SHOWN),
  };
}
