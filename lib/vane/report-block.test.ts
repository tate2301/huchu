/**
 * Vane writing a block for a report being built, with a stand-in playing
 * Claude: it is shown the sources the person can read and the blocks on the
 * page; a block that does not check goes back once with the problem; the one
 * that checks comes back with Vane's note, for the person to keep or not.
 */
import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { reportFeatureKey } from "@/lib/reports/access";
import { getReportDefinition } from "@/lib/reports/registry";

import type { MessagesClient } from "./claude";
import { writeReportBlock } from "./report-block";
import { VaneWriteRefused } from "./write";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", user: "" };

function claude(...answers: string[]) {
  const sent: string[] = [];
  const create = vi.fn(async (request: { messages: Array<{ content: string }> }) => {
    sent.push(request.messages[0]!.content);
    const text = answers.shift() ?? "";
    return {
      id: "msg",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text, citations: null }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 150, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    } as unknown as Anthropic.Message;
  });
  return { client: { messages: { create } } as unknown as MessagesClient, sent };
}

const session = () => {
  const feature = reportFeatureKey(getReportDefinition("crm-deals")!);
  return { user: { id: ids.user, companyId: ids.company, role: "MANAGER", name: "Farai", enabledFeatures: feature ? [feature] : [] } } as unknown as AuthenticatedSession;
};

beforeAll(async () => {
  vi.stubEnv("VANE_MODEL", "claude-sonnet-5-5");
  const company = await prisma.company.create({ data: { name: `Vane block ${suffix}`, slug: `vane-block-${suffix}` } });
  const user = await prisma.user.create({ data: { email: `farai-${suffix}@vane.test`, name: "Farai", password: "x", role: "MANAGER", companyId: company.id } });
  Object.assign(ids, { company: company.id, user: user.id });
});

afterAll(async () => {
  await prisma.vaneJob.deleteMany({ where: { companyId: ids.company } });
  await prisma.user.deleteMany({ where: { companyId: ids.company } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
});

describe("Vane writing a report block", () => {
  it("corrects a block that does not check, and hands back the one that does with its note", async () => {
    const wrong = JSON.stringify({ name: "won_value", query: "select sum(value) as won from nowhere", display: { type: "figures" }, note: "x" });
    const right = JSON.stringify({
      name: "won_value",
      title: "Won value",
      query: "select stage, sum(value) as value from crm_deals group by stage",
      display: { type: "breakdown", by: "stage" },
      note: "You asked for value by stage. It reads Deals and sums each stage.",
    });
    const { client, sent } = claude(wrong, right);
    const written = await writeReportBlock(prisma, session(), { request: "Value by stage", blocks: [] }, client);

    expect(written.block).toMatchObject({ type: "query", name: "won_value", display: { type: "breakdown", by: "stage" } });
    expect(written.note).toContain("value by stage");
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("crm_deals");
    expect(sent[1]).toContain("did not check");
    expect(await prisma.vaneJob.findFirstOrThrow({ where: { companyId: ids.company, kind: "write" } })).toMatchObject({ status: "DONE", tokensIn: 1800 });
  });

  it("gives up after a second block that does not check, saying why", async () => {
    const wrong = JSON.stringify({ name: "x", query: "select * from nowhere", display: { type: "table" }, note: "x" });
    await expect(writeReportBlock(prisma, session(), { request: "Anything", blocks: [] }, claude(wrong, wrong).client)).rejects.toBeInstanceOf(VaneWriteRefused);
  });
});
