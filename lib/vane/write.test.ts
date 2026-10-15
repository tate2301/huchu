/**
 * Vane writing a quote's email, with a stand-in playing Claude: it is given
 * the quote's figures, how long it holds and what was said lately on the
 * record; what comes back is a subject and a note for the person to change;
 * the request is kept as a job against the allowance; and nothing is asked
 * of Claude while Vane is paused.
 */
import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createQuotationForLead } from "@/lib/crm/accounting-bridge";
import { prisma } from "@/lib/prisma";

import type { MessagesClient } from "./claude";
import { VaneWriteRefused, writeDocumentEmail } from "./write";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", user: "", doc: "" };

function claude(answer: string) {
  const create = vi.fn(async (_request: unknown) =>
    ({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text: answer, citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 600, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    }) as unknown as Anthropic.Message,
  );
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

const who = () => ({ companyId: ids.company, userId: ids.user, name: "James" });

beforeAll(async () => {
  vi.stubEnv("VANE_MODEL", "claude-sonnet-5-5");
  const company = await prisma.company.create({ data: { name: `Vane write ${suffix}`, slug: `vane-write-${suffix}` } });
  const user = await prisma.user.create({ data: { email: `james-${suffix}@vane.test`, name: "James", password: "x", role: "MANAGER", companyId: company.id } });
  const lead = await prisma.crmLead.create({ data: { companyId: company.id, leadNo: `LEAD-W-${suffix}`, title: "Lounge and passage", contactName: "Rudo Moyo" } });
  await prisma.crmActivity.create({
    data: { companyId: company.id, leadId: lead.id, type: "CALL", subject: "Kuda can start Monday 19 October", occurredAt: new Date("2026-10-13T10:00:00Z"), createdById: user.id },
  });
  const quote = await createQuotationForLead({
    companyId: company.id,
    userId: user.id,
    leadId: lead.id,
    lines: [{ description: "Laminate planks, oak", quantity: 13, unitPrice: 24.5 }],
    validUntil: new Date("2026-11-13T00:00:00Z"),
  });
  Object.assign(ids, { company: company.id, user: user.id, doc: quote.leadDocumentId });
});

afterAll(async () => {
  await prisma.vaneJob.deleteMany({ where: { companyId: ids.company } });
  await prisma.vaneSettings.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmActivity.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmLeadDocument.deleteMany({ where: { companyId: ids.company } });
  await prisma.salesQuotation.deleteMany({ where: { companyId: ids.company } });
  await prisma.crmLead.deleteMany({ where: { companyId: ids.company } });
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.delete({ where: { id: ids.company } }).catch(() => {});
});

describe("Vane writing a quote's email", () => {
  it("writes from the quote and the record, and keeps the request as a job", async () => {
    const { client, create } = claude(
      'Here it is:\n{"subject": "Your lounge and passage", "message": "Good afternoon Rudo.\\n\\nHere is the quote for the oak laminate: USD 318.50. It holds until 13 November.\\n\\nJames"}',
    );
    const email = await writeDocumentEmail(prisma, who(), ids.doc, client);
    expect(email).toEqual({ subject: "Your lounge and passage", message: expect.stringContaining("Good afternoon Rudo.") });

    const prompt = JSON.stringify(create.mock.calls[0]![0]);
    for (const fact of ["USD 318.50", "Rudo Moyo", "13 November 2026", "Kuda can start Monday 19 October", "13 × Laminate planks, oak", "James"]) {
      expect(prompt).toContain(fact);
    }
    expect(prompt).not.toMatch(/https?:\/\//);
    expect(await prisma.vaneJob.findFirstOrThrow({ where: { companyId: ids.company, kind: "write" } })).toMatchObject({
      status: "DONE",
      requestedById: ids.user,
      tokensIn: 600,
      tokensOut: 120,
    });
  });

  it("says so when the answer is not an email, and asks nothing of Claude while Vane is paused", async () => {
    await expect(writeDocumentEmail(prisma, who(), ids.doc, claude("I would rather not.").client)).rejects.toThrow("did not come back whole");
    await prisma.vaneSettings.create({ data: { companyId: ids.company, paused: true } });
    const { client, create } = claude("{}");
    await expect(writeDocumentEmail(prisma, who(), ids.doc, client)).rejects.toBeInstanceOf(VaneWriteRefused);
    expect(create).not.toHaveBeenCalled();
  });
});
