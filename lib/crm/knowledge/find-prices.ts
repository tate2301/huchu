import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { MessagesClient } from "@/lib/vane/claude";
import { jsonIn, VaneWriteRefused, writeAsJob, type Who } from "@/lib/vane/write";

import { readAmount } from "./read";

/**
 * Vane reads a prose document in the knowledge base (a PDF rate card, a Word
 * price schedule) for its prices. Each price it finds must quote the words it
 * came from, and those words must be in the document with the amount in them;
 * anything else is dropped as made up. What is left waits on the document's
 * page for a person to keep (`decidePrices`): Vane quotes only from kept prices.
 */

const SYSTEM = `You are Vane, the helper inside Corelith. You read a business's own document and list the prices in it: each thing it charges for, with its unit and amount, exactly as the document says. You never invent a price, change an amount, or work one out. Answer with only a JSON object.`;

/** The words Vane reads of one document: a long rate card fits; the rest is said to be left. */
const READ = 60_000;

const answerSchema = z.object({
  prices: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(300),
        description: z.string().trim().max(500).nullish(),
        code: z.string().trim().max(60).nullish(),
        unit: z.string().trim().max(40).nullish(),
        unitPrice: z.number().nonnegative(),
        currency: z.string().trim().length(3).nullish(),
        quote: z.string().trim().min(3).max(500).describe("The words of the document the price is in, copied exactly."),
      }),
    )
    .max(400),
});

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Amounts written as money: beside a currency mark ("$45", "USD 62", "ZWG 1 200"), or with cents ("62.00"). "30 days" is not one. */
const MONEY = /(?:US\$|\$|\bUSD|\bZWG|\bZiG|\bZAR|\bR(?=\s?\d))\s?(\d[\d ,]*(?:\.\d+)?)|(\d{1,3}(?:[ ,]\d{3})*\.\d{2}|\d+\.\d{2})\b/g;

/** A price stands only when the words it quotes are in the document and say its amount, as money. */
export function checkFound(found: z.infer<typeof answerSchema>["prices"], text: string) {
  const whole = squash(text);
  return found.filter((price) => {
    const quote = squash(price.quote);
    if (!whole.includes(quote)) return false;
    const amounts = [...price.quote.matchAll(MONEY)].map((match) => readAmount(match[1] ?? match[2] ?? "")?.value);
    return amounts.some((amount) => amount !== undefined && Math.abs(amount - price.unitPrice) < 0.005);
  });
}

export async function findPricesInDocument(db: PrismaClient, who: Who, docId: string, client?: MessagesClient): Promise<{ found: number; read: number; of: number }> {
  const doc = await db.crmKnowledgeDoc.findFirst({ where: { id: docId, companyId: who.companyId }, select: { id: true, title: true, text: true, kind: true } });
  if (!doc) throw new VaneWriteRefused(404, "That document is not in the knowledge base.");
  const text = doc.text.slice(0, READ);

  const prompt = `The document "${doc.title}"${doc.text.length > READ ? ` (its first ${READ.toLocaleString("en-US")} of ${doc.text.length.toLocaleString("en-US")} characters)` : ""}:

<document>
${text}
</document>

List every price in it: {"prices": [{"name": "Vinyl sheet, supply and fit", "description": null, "code": null, "unit": "m²", "unitPrice": 62, "currency": "USD", "quote": "Vinyl sheet, supply and fit .......... $62.00 per m²"}]}. "quote" is copied exactly from the document and holds the amount. A range or "from" price is not a price. None when there are none.`;

  const prices = await writeAsJob(
    db,
    who,
    `Read ${doc.title} for its prices`,
    async (ask) => {
      const answer = answerSchema.safeParse(jsonIn(await ask(prompt)));
      if (!answer.success) throw new VaneWriteRefused(503, "Vane's list of prices did not come back whole. Try again.");
      return checkFound(answer.data.prices, text);
    },
    client,
    SYSTEM,
  );

  // What Vane found before and nobody kept goes; kept prices stay as they are.
  let fresh = prices;
  await db.$transaction(async (tx) => {
    await tx.crmKnowledgePrice.deleteMany({ where: { companyId: who.companyId, docId, kept: false } });
    // A price already kept is not found again.
    const kept = await tx.crmKnowledgePrice.findMany({ where: { docId, kept: true }, select: { name: true, unitPrice: true } });
    const isKept = (price: (typeof prices)[number]) => kept.some((row) => squash(row.name) === squash(price.name) && Math.abs(Number(row.unitPrice) - price.unitPrice) < 0.005);
    fresh = prices.filter((price) => !isKept(price));
    const last = await tx.crmKnowledgePrice.aggregate({ where: { docId }, _max: { position: true } });
    const start = (last._max.position ?? -1) + 1;
    if (fresh.length) {
      await tx.crmKnowledgePrice.createMany({
        data: fresh.map((price, index) => ({
          companyId: who.companyId,
          docId,
          position: start + index,
          name: price.name,
          description: price.description ?? null,
          code: price.code ?? null,
          unit: price.unit ?? null,
          unitPrice: new Prisma.Decimal(price.unitPrice),
          currency: price.currency?.toUpperCase() ?? "USD",
          source: price.quote,
          kept: false,
        })),
      });
    }
    await tx.crmKnowledgeDoc.update({ where: { id: docId }, data: { pricesFoundAt: new Date() } });
  });
  return { found: fresh.length, read: text.length, of: doc.text.length };
}
