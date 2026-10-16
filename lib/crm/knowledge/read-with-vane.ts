import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { MessagesClient } from "@/lib/vane/claude";
import { jsonIn, VaneWriteRefused, writeAsJob, type Who } from "@/lib/vane/write";

import { readAmount } from "./read";

/**
 * Vane reads a document in the knowledge base for what the business would
 * want to know at a glance: the questions it answers (FAQs), the facts it
 * states, the tips it gives, and the prices it lists. Everything it finds
 * must quote the words it came from, and those words must be in the
 * document; a price's amount must be in them, written as money. Anything else
 * is dropped as made up. What is left waits on the document's page for a
 * person to keep: Vane answers and quotes only from kept knowledge.
 */

const SYSTEM = `You are Vane, the helper inside Corelith. You read a business's own document and pull out what its people would want to know at a glance: the questions it answers, the facts it states, the tips it gives and the prices it lists, each exactly as the document says. You never invent, change or work anything out. Answer with only a JSON object.`;

/** The words Vane reads of one document: a long handbook fits; the rest is said to be left. */
const READ = 60_000;

const quote = z.string().trim().min(3).max(600).describe("The words of the document it is in, copied exactly.");

const answerSchema = z.object({
  faqs: z.array(z.object({ question: z.string().trim().min(3).max(300), answer: z.string().trim().min(1).max(2000), quote })).max(60).default([]),
  facts: z.array(z.object({ fact: z.string().trim().min(3).max(300), detail: z.string().trim().max(2000).default(""), quote })).max(60).default([]),
  tips: z.array(z.object({ tip: z.string().trim().min(3).max(300), detail: z.string().trim().max(2000).default(""), quote })).max(60).default([]),
  prices: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(300),
        description: z.string().trim().max(500).nullish(),
        code: z.string().trim().max(60).nullish(),
        unit: z.string().trim().max(40).nullish(),
        unitPrice: z.number().nonnegative(),
        currency: z.string().trim().length(3).nullish(),
        quote,
      }),
    )
    .max(400)
    .default([]),
});
type Answer = z.infer<typeof answerSchema>;

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** Amounts written as money: beside a currency mark ("$45", "USD 62", "ZWG 1 200"), or with cents ("62.00"). "30 days" is not one. */
const MONEY = /(?:US\$|\$|\bUSD|\bZWG|\bZiG|\bZAR|\bR(?=\s?\d))\s?(\d[\d ,]*(?:\.\d+)?)|(\d{1,3}(?:[ ,]\d{3})*\.\d{2}|\d+\.\d{2})\b/g;

/** Found in the document: the words it quotes are there. */
const inDocument = (whole: string) => (item: { quote: string }) => whole.includes(squash(item.quote));

/** A price stands only when the words it quotes are in the document and say its amount, as money. */
export function checkFound(found: Answer["prices"], text: string) {
  const whole = squash(text);
  return found.filter((price) => {
    if (!inDocument(whole)(price)) return false;
    const amounts = [...price.quote.matchAll(MONEY)].map((match) => readAmount(match[1] ?? match[2] ?? "")?.value);
    return amounts.some((amount) => amount !== undefined && Math.abs(amount - price.unitPrice) < 0.005);
  });
}

/** What stands of what Vane found: each entry and price only where the document says it. */
export function checkAll(answer: Answer, text: string) {
  const whole = squash(text);
  const found = inDocument(whole);
  return {
    entries: [
      ...answer.faqs.filter(found).map((item) => ({ kind: "FAQ" as const, title: item.question, body: item.answer, source: item.quote })),
      ...answer.facts.filter(found).map((item) => ({ kind: "FACT" as const, title: item.fact, body: item.detail || item.fact, source: item.quote })),
      ...answer.tips.filter(found).map((item) => ({ kind: "TIP" as const, title: item.tip, body: item.detail || item.tip, source: item.quote })),
    ],
    prices: checkFound(answer.prices, text),
  };
}

export type ReadResult = { faqs: number; facts: number; tips: number; prices: number; read: number; of: number };

export async function readDocumentWithVane(db: PrismaClient, who: Who, docId: string, client?: MessagesClient): Promise<ReadResult> {
  const doc = await db.crmKnowledgeDoc.findFirst({ where: { id: docId, companyId: who.companyId }, select: { id: true, title: true, text: true } });
  if (!doc) throw new VaneWriteRefused(404, "That document is not in the knowledge base.");
  const text = doc.text.slice(0, READ);

  const prompt = `The document "${doc.title}"${doc.text.length > READ ? ` (its first ${READ.toLocaleString("en-US")} of ${doc.text.length.toLocaleString("en-US")} characters)` : ""}:

<document>
${text}
</document>

Pull out, as the document says them:
- faqs: questions a client or a new member of staff would ask that it answers ("Do you need a deposit?" → "Yes: half, before work starts.").
- facts: things it states about the business: where it works, its hours, what it guarantees, how long things take.
- tips: advice it gives for doing the work well.
- prices: each thing it charges for, with its unit and amount. A range or "from" price is not a price.
{"faqs": [{"question": "…", "answer": "…", "quote": "…"}], "facts": [{"fact": "…", "detail": "…", "quote": "…"}], "tips": [{"tip": "…", "detail": "…", "quote": "…"}], "prices": [{"name": "Vinyl sheet, supply and fit", "unit": "m²", "unitPrice": 62, "currency": "USD", "quote": "Vinyl sheet, supply and fit .......... $62.00 per m²"}]}
Each "quote" is copied exactly from the document. Leave a list empty when the document has none.`;

  const found = await writeAsJob(
    db,
    who,
    `Read ${doc.title} for the knowledge base`,
    async (ask) => {
      const answer = answerSchema.safeParse(jsonIn(await ask(prompt)));
      if (!answer.success) throw new VaneWriteRefused(503, "What Vane found did not come back whole. Try again.");
      return checkAll(answer.data, text);
    },
    client,
    SYSTEM,
  );

  let fresh = found;
  await db.$transaction(async (tx) => {
    // What Vane found before and nobody kept goes; kept knowledge stays as it is, and is not found again.
    await tx.crmKnowledgePrice.deleteMany({ where: { companyId: who.companyId, docId, kept: false } });
    await tx.crmKnowledgeEntry.deleteMany({ where: { companyId: who.companyId, docId, kept: false } });
    const [keptPrices, keptEntries] = await Promise.all([
      tx.crmKnowledgePrice.findMany({ where: { docId, kept: true }, select: { name: true, unitPrice: true } }),
      tx.crmKnowledgeEntry.findMany({ where: { companyId: who.companyId, kept: true }, select: { title: true } }),
    ]);
    fresh = {
      prices: found.prices.filter((price) => !keptPrices.some((row) => squash(row.name) === squash(price.name) && Math.abs(Number(row.unitPrice) - price.unitPrice) < 0.005)),
      entries: found.entries.filter((entry) => !keptEntries.some((row) => squash(row.title) === squash(entry.title))),
    };
    const last = await tx.crmKnowledgePrice.aggregate({ where: { docId }, _max: { position: true } });
    const start = (last._max.position ?? -1) + 1;
    if (fresh.prices.length) {
      await tx.crmKnowledgePrice.createMany({
        data: fresh.prices.map((price, index) => ({
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
    if (fresh.entries.length) {
      await tx.crmKnowledgeEntry.createMany({
        data: fresh.entries.map((entry) => ({ companyId: who.companyId, docId, ...entry, kept: false, madeByVane: true })),
      });
    }
    await tx.crmKnowledgeDoc.update({ where: { id: docId }, data: { vaneReadAt: new Date() } });
  });
  const count = (kind: "FAQ" | "FACT" | "TIP") => fresh.entries.filter((entry) => entry.kind === kind).length;
  return { faqs: count("FAQ"), facts: count("FACT"), tips: count("TIP"), prices: fresh.prices.length, read: text.length, of: doc.text.length };
}
