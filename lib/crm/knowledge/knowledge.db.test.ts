/**
 * The knowledge base and the quotes Vane drafts from it, against the test
 * database: a price list is filed and searched; prices Vane finds in prose
 * are kept only when they are in the words it quotes; a quote drafted through
 * the `draft` tool takes each kept price exactly, marks the line it had to
 * estimate, is Vane's draft until a person issues it (or deletes it), and a
 * rep may draft one only on their own deal.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import type { MessagesClient } from "@/lib/vane/claude";
import { callTool } from "@/lib/vane/tools";

import { askKnowledge } from "./ask";
import { addEntry, decideEntries } from "./entries";
import { readDocumentWithVane } from "./read-with-vane";
import { readKnowledgeFile } from "./read";
import { addKnowledgeDoc, decidePrices, readKnowledgeDoc, searchKnowledge } from "./store";
import { deleteVaneQuote, issueVaneQuote, vaneQuoteView } from "./vane-quote";

const SLUG = `crm-knowledge-test-${Date.now()}`;
const ids = { company: "", manager: "", rep: "", other: "", deal: "", repDeal: "", priceList: "", terms: "" };

function claude(answer: string) {
  const create = vi.fn(async () => ({
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: answer, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 400, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }) as unknown as Anthropic.Message);
  return { messages: { create } } as unknown as MessagesClient;
}

beforeAll(async () => {
  vi.stubEnv("VANE_MODEL", "claude-sonnet-5-5");
  const company = await prisma.company.create({ data: { name: SLUG, slug: SLUG } });
  const user = (name: string, role: string) =>
    prisma.user.create({ data: { email: `${name.toLowerCase()}-${SLUG}@kb.test`, name, role: role as never, companyId: company.id }, select: { id: true } });
  const [manager, rep, other] = [await user("Farai", "MANAGER"), await user("Rudo", "SALES_REP"), await user("Kuda", "SALES_REP")];
  const client = await prisma.crmClient.create({ data: { companyId: company.id, clientNo: "CRMC-K1", name: "Pomona Offices" } });
  const pipeline = await prisma.crmPipeline.create({ data: { companyId: company.id, name: "Sales", isDefault: true } });
  const stage = await prisma.crmPipelineStage.create({ data: { companyId: company.id, pipelineId: pipeline.id, name: "Quoting", position: 1 } });
  const deal = (dealNo: string, assignedToId: string | null) =>
    prisma.crmDeal.create({ data: { companyId: company.id, dealNo, title: "Carpet tiles, offices", pipelineId: pipeline.id, stageId: stage.id, clientId: client.id, assignedToId }, select: { id: true } });

  const sheet = await readKnowledgeFile(
    Buffer.from("Code,Item,Unit,Price\nCT-50,Carpet tiles supply and lay,m²,38.50\nUL-1,Underlay,m²,6.00\nSCR-2,Self-levelling screed,m²,18.50\n"),
    "rate-card.csv",
  );
  const file = (title: string) => ({ title, fileName: `${title}.csv`, contentType: "text/csv", size: 100, url: `https://blob.test/${title}`, pathname: null });
  const priceList = await addKnowledgeDoc(prisma, { companyId: company.id, userId: manager.id }, file("Rate card 2026"), sheet);
  const terms = await addKnowledgeDoc(
    prisma,
    { companyId: company.id, userId: manager.id },
    file("Terms and extras"),
    await readKnowledgeFile(
      Buffer.from("Our terms\n\nA 50% deposit is due before work starts. Quotes hold for 30 days.\n\nExtras\n\nFurniture moving is charged at $45.00 per room. Skirting is replaced at cost."),
      "terms.txt",
    ),
  );
  Object.assign(ids, {
    company: company.id,
    manager: manager.id,
    rep: rep.id,
    other: other.id,
    deal: (await deal("D-K1", manager.id)).id,
    repDeal: (await deal("D-K2", rep.id)).id,
    priceList: priceList.id,
    terms: terms.id,
  });
});

afterAll(async () => {
  await prisma.crmLeadDocument.deleteMany({ where: { companyId: ids.company } });
  await prisma.salesQuotation.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmActivity.deleteMany({ where: { companyId: ids.company } });
  await prisma.vaneJob.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmDeal.deleteMany({ where: { companyId: ids.company } });
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

const context = (rep: string | null = null) => ({ companyId: ids.company, jobId: null, rep });

describe("the knowledge base", () => {
  it("files a price list's rows as kept prices, and finds them and the words by search", async () => {
    const doc = await readKnowledgeDoc(prisma, ids.company, ids.priceList);
    expect(doc).toMatchObject({ kind: "PRICE_LIST", prices: [{ name: "Carpet tiles supply and lay", unit: "m²", unitPrice: 38.5, kept: true }, {}, {}] });

    const tiles = await searchKnowledge(prisma, ids.company, "carpet tiles");
    expect(tiles.prices[0]).toMatchObject({ name: "Carpet tiles supply and lay", unitPrice: 38.5, title: "Rate card 2026" });
    const deposit = await searchKnowledge(prisma, ids.company, "deposit");
    expect(deposit.passages[0]).toMatchObject({ title: "Terms and extras" });
    expect(deposit.passages[0]!.text).toContain("50% deposit");
  });

  it("keeps only what Vane found that the document says, each waiting for a person to keep it", async () => {
    const answer = JSON.stringify({
      faqs: [
        { question: "Do you need a deposit?", answer: "Yes: half, before work starts.", quote: "A 50% deposit is due before work starts." },
        // Made up: the document never says it.
        { question: "Do you work weekends?", answer: "Yes.", quote: "We work Saturdays and Sundays." },
      ],
      facts: [{ fact: "Quotes hold for 30 days", detail: "", quote: "Quotes hold for 30 days." }],
      tips: [],
      prices: [
        { name: "Furniture moving", unit: "room", unitPrice: 45, currency: "USD", quote: "Furniture moving is charged at $45.00 per room." },
        // Made up: the document never says it.
        { name: "Stair nosing", unit: "m", unitPrice: 12, currency: "USD", quote: "Stair nosing is $12.00 per metre." },
        // In the document, but at another amount.
        { name: "Deposit", unitPrice: 30, quote: "Quotes hold for 30 days." },
      ],
    });
    const found = await readDocumentWithVane(prisma, { companyId: ids.company, userId: ids.manager, name: "Farai" }, ids.terms, claude(answer));
    expect(found).toMatchObject({ faqs: 1, facts: 1, tips: 0, prices: 1 });
    expect(await prisma.crmKnowledgeEntry.findMany({ where: { docId: ids.terms }, orderBy: { kind: "asc" } })).toMatchObject([
      { kind: "FAQ", title: "Do you need a deposit?", kept: false, madeByVane: true, source: "A 50% deposit is due before work starts." },
      { kind: "FACT", title: "Quotes hold for 30 days", kept: false },
    ]);
    const waiting = await prisma.crmKnowledgePrice.findMany({ where: { docId: ids.terms } });
    expect(waiting).toMatchObject([{ name: "Furniture moving", kept: false, source: "Furniture moving is charged at $45.00 per room." }]);
    // Not kept, so Vane does not quote from it.
    expect((await searchKnowledge(prisma, ids.company, "furniture moving")).prices).toEqual([]);
    expect(await decidePrices(prisma, ids.company, ids.terms, [waiting[0]!.id], true)).toBe(1);
    expect((await searchKnowledge(prisma, ids.company, "furniture moving")).prices[0]).toMatchObject({ unitPrice: 45 });
  });
});

describe("FAQs, facts and tips, and asking Vane", () => {
  it("searches kept entries first, and only kept ones", async () => {
    // The FAQ Vane found is not kept yet, so a search does not find it.
    expect((await searchKnowledge(prisma, ids.company, "deposit")).entries).toEqual([]);
    const faq = await prisma.crmKnowledgeEntry.findFirstOrThrow({ where: { companyId: ids.company, kind: "FAQ" } });
    expect(await decideEntries(prisma, ids.company, [faq.id], true)).toBe(1);
    await addEntry(prisma, { companyId: ids.company, userId: ids.manager }, { kind: "TIP", title: "Take a moisture reading before quoting vinyl", body: "Concrete under 75% relative humidity, or the vinyl lifts." });
    expect((await searchKnowledge(prisma, ids.company, "deposit")).entries).toMatchObject([{ kind: "FAQ", title: "Do you need a deposit?" }]);
    expect((await searchKnowledge(prisma, ids.company, "moisture vinyl")).entries).toMatchObject([{ kind: "TIP" }]);
  });

  it("answers from the knowledge base with what it went by, and says so when nothing in it matches", async () => {
    const who = { companyId: ids.company, userId: ids.manager, name: "Farai" };
    const answered = await askKnowledge(prisma, who, "Do we take a deposit?", claude(JSON.stringify({ answer: "Yes: **half**, before work starts.", used: [1], answered: true })));
    expect(answered).toMatchObject({ answered: true, answer: "Yes: **half**, before work starts.", sources: [{ title: "Do you need a deposit?", note: "FAQ", href: "/crm/knowledge?tab=faq" }] });
    const none = await askKnowledge(prisma, who, "zzqx flibbertigibbet");
    expect(none).toMatchObject({ answered: false, sources: [] });
  });
});

describe("a quote Vane drafts from it", () => {
  const priceOf = async (name: string) => (await prisma.crmKnowledgePrice.findFirstOrThrow({ where: { companyId: ids.company, name } })).id;

  it("takes each kept price exactly, marks the line it estimated, and is Vane's draft", async () => {
    const drafted = await callTool(context(), "draft", {
      kind: "quote",
      dealId: ids.deal,
      quoteLines: [
        // Vane's own figure is ignored for a knowledge price: the line takes the price as kept.
        { knowledgePriceId: await priceOf("Carpet tiles supply and lay"), quantity: 212.4, unitPrice: 1 },
        { knowledgePriceId: await priceOf("Underlay"), quantity: 212.4 },
        { description: "Remove the old carpet", quantity: 1, unitPrice: 300 },
      ],
      notes: "Assumes the floor is level.",
    });
    expect(drafted.ok).toBe(true);
    const result = JSON.parse(drafted.content);
    expect(result).toMatchObject({ drafted: "quote", estimatedLines: 1, currency: "USD", link: expect.stringMatching(/^\/crm\/quotes\//) });

    const quote = await prisma.salesQuotation.findUniqueOrThrow({ where: { id: result.quotationId }, include: { lines: { orderBy: { createdAt: "asc" } } } });
    expect(quote).toMatchObject({ status: "DRAFT", madeByVane: true, createdById: null, issuedById: null, total: 9751.8 });
    expect(quote.lines.map((line) => [line.description, line.unitPrice, Boolean(line.knowledgePriceId)])).toEqual([
      ["Carpet tiles supply and lay, per m²", 38.5, true],
      ["Underlay, per m²", 6, true],
      ["Remove the old carpet", 300, false],
    ]);

    const view = await vaneQuoteView(prisma, ids.company, result.quotationId);
    expect(view).toMatchObject({ status: "Draft", madeByVane: true, customer: "Pomona Offices", unpriced: 1 });
    expect(view!.lines[0]!.source).toEqual({ title: "Rate card 2026: Carpet tiles supply and lay", href: `/crm/knowledge/${ids.priceList}` });
  });

  it("is issued by a person, once, and is then theirs", async () => {
    const doc = await prisma.crmLeadDocument.findFirstOrThrow({ where: { companyId: ids.company, dealId: ids.deal } });
    expect(await issueVaneQuote({ companyId: ids.company, userId: ids.manager }, doc.id)).toMatchObject({ number: expect.any(String) });
    expect(await prisma.salesQuotation.findUniqueOrThrow({ where: { id: doc.quotationId! } })).toMatchObject({ status: "SENT", issuedById: ids.manager });
    await expect(issueVaneQuote({ companyId: ids.company, userId: ids.manager }, doc.id)).rejects.toThrow("issued already");
    await expect(deleteVaneQuote(ids.company, doc.id)).rejects.toThrow("issued already");
  });

  it("lets a rep quote on their own deal only, and a draft nobody issued be deleted", async () => {
    const lines = [{ knowledgePriceId: await priceOf("Self-levelling screed"), quantity: 40 }];
    const notTheirs = await callTool(context(ids.rep), "draft", { kind: "quote", dealId: ids.deal, quoteLines: lines });
    expect(notTheirs).toMatchObject({ ok: false, content: expect.stringContaining("not theirs") });
    const theirs = await callTool(context(ids.rep), "draft", { kind: "quote", dealId: ids.repDeal, quoteLines: lines });
    expect(theirs.ok).toBe(true);
    // Other drafting stays off for a rep.
    expect(await callTool(context(ids.rep), "draft", { kind: "work_order", equipmentId: "x", issue: "x", note: "x" })).toMatchObject({ ok: false });

    const doc = await prisma.crmLeadDocument.findFirstOrThrow({ where: { companyId: ids.company, dealId: ids.repDeal } });
    await deleteVaneQuote(ids.company, doc.id);
    expect(await prisma.crmLeadDocument.findUnique({ where: { id: doc.id } })).toBeNull();
    expect(await prisma.salesQuotation.findUnique({ where: { id: doc.quotationId! } })).toBeNull();
  });

  it("refuses a price that is not kept, or prices in two currencies", async () => {
    const waiting = await prisma.crmKnowledgePrice.create({
      data: { companyId: ids.company, docId: ids.terms, position: 99, name: "Waiting price", unitPrice: 5, currency: "USD", source: "x", kept: false },
    });
    const refused = await callTool(context(), "draft", { kind: "quote", dealId: ids.deal, quoteLines: [{ knowledgePriceId: waiting.id, quantity: 1 }] });
    expect(refused).toMatchObject({ ok: false, content: expect.stringContaining("not a kept price") });
    const zwg = await prisma.crmKnowledgePrice.create({
      data: { companyId: ids.company, docId: ids.terms, position: 100, name: "Callout ZWG", unitPrice: 500, currency: "ZWG", source: "x", kept: true },
    });
    const mixed = await callTool(context(), "draft", {
      kind: "quote",
      dealId: ids.deal,
      quoteLines: [{ knowledgePriceId: zwg.id, quantity: 1 }, { knowledgePriceId: await priceOf("Underlay"), quantity: 1 }],
    });
    expect(mixed).toMatchObject({ ok: false, content: expect.stringContaining("one currency") });
  });
});
