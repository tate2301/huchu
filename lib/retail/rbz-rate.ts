import { prisma } from "@/lib/prisma";
import { setZigRate } from "@/lib/retail/payment-settings";

/**
 * The RBZ's daily ZiG rate (10-setup W-05, "Daily, RBZ rate").
 *
 * Which feed publishes it is an open question, so the adapter is behind a
 * flag: `RBZ_RATE_URL` names an endpoint answering `{ "rate": 26.8 }` (ZiG
 * per US dollar). Without it the option is hidden on Payments and the job
 * does nothing.
 */

export function rbzRateAvailable(): boolean {
  return Boolean(process.env.RBZ_RATE_URL?.trim());
}

/** Today's rate from the feed; throws when it does not answer with one. */
export async function fetchRbzRate(): Promise<number> {
  const url = process.env.RBZ_RATE_URL?.trim();
  if (!url) throw new Error("RBZ_RATE_URL is not set");
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`The RBZ rate feed answered ${response.status}`);
  const body = (await response.json()) as { rate?: unknown };
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 100000) throw new Error("The RBZ rate feed sent no usable rate");
  return rate;
}

/**
 * The 07:00 job: every shop whose rate is updated daily gets the RBZ's rate
 * (`CurrencyRate { source: RBZ, createdById: null }`). Safe to run twice: an
 * unchanged rate writes nothing.
 */
export async function applyRbzRate(now: Date = new Date()): Promise<string> {
  if (!rbzRateAvailable()) return "no RBZ feed configured";
  const shops = await prisma.retailPaymentSettings.findMany({
    where: { zigRateSource: "RBZ_DAILY", takeCashZig: true },
    select: { companyId: true },
  });
  if (shops.length === 0) return "no shop takes the RBZ rate";
  const rate = await fetchRbzRate();
  let changed = 0;
  for (const shop of shops) {
    const wrote = await prisma.$transaction((tx) =>
      setZigRate(tx, { actor: null, companyId: shop.companyId, rate, source: "RBZ", at: now }),
    );
    if (wrote) changed += 1;
  }
  return `rate ${rate}, ${changed} of ${shops.length} shops changed`;
}
