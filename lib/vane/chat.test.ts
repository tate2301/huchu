/**
 * A turn of a person's chat with Vane, with a stand-in playing Claude: the
 * person's words and Vane's answer are kept in their conversation, the
 * actions Vane proposes hang on the answer waiting for a person, the panel
 * hears what Vane is doing, and the turn's cost is kept on a chat job. Chat is
 * refused while Vane is paused, and while the person's last turn still runs.
 */
import { randomUUID } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";

import { chatHistory, chatTurn, type ChatEvent } from "./chat";
import type { MessagesClient } from "./claude";
import { useTestReaderLogins } from "./test-reader-logins";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", user: "" };

function reply(content: Anthropic.ContentBlock[], stop: Anthropic.Message["stop_reason"]) {
  return {
    id: `msg_${randomUUID()}`,
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 80, cache_read_input_tokens: 400, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Anthropic.ContentBlock;
const text = (value: string) => ({ type: "text", text: value, citations: null }) as unknown as Anthropic.ContentBlock;

function claude(...turns: Anthropic.Message[]) {
  /** Each request as it was sent: the conversation grows after the call, so it is copied then. */
  const sent: unknown[] = [];
  const create = vi.fn(async (request: unknown) => {
    sent.push(structuredClone(request));
    const next = turns.shift();
    if (!next) throw new Error("Claude was asked more than the test expected");
    return next;
  });
  return { client: { messages: { create } } as unknown as MessagesClient, create, sent };
}

const who = () => ({ companyId: ids.company, userId: ids.user, role: "MANAGER", name: "James" });

beforeAll(async () => {
  vi.stubEnv("VANE_MODEL", "claude-sonnet-5-5");
  await useTestReaderLogins();
  const company = await prisma.company.create({ data: { name: `Vane chat ${suffix}`, slug: `vane-chat-${suffix}` } });
  const user = await prisma.user.create({
    data: { email: `james-${suffix}@vane.test`, name: "James", password: "x", role: "MANAGER", companyId: company.id },
  });
  Object.assign(ids, { company: company.id, user: user.id });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.company.deleteMany({ where: { id: ids.company } });
});

describe("chat with Vane", () => {
  it("answers while the person waits, with the actions it proposes hung on the answer", async () => {
    const { client } = claude(
      reply([toolUse("t1", "run_sql", { sql: `SELECT "id" FROM "SalesInvoice"` })], "tool_use"),
      reply(
        [
          toolUse("t2", "propose_actions", {
            actions: [{ kind: "books.invoice.due_date", params: { invoiceId: "i1", invoiceNumber: "INV-0142", dueDate: "2026-10-30" } }],
          }),
        ],
        "tool_use",
      ),
      reply([text("INV-0142 has no due date. I proposed 30 October, their usual 21 days. [See it](/books/invoices?q=INV-0142)")], "end_turn"),
    );
    const events: ChatEvent[] = [];
    await chatTurn(prisma, who(), { text: "Which invoices have no due date?", module: "books" }, { onEvent: (event) => events.push(event), client });

    expect(events.filter((event) => event.type === "working").map((event) => event.type === "working" && event.label)).toEqual([
      "Reading your question",
      "Reading the workspace",
      "Getting the actions ready",
    ]);
    const answer = events.at(-1);
    expect(answer).toMatchObject({
      type: "answer",
      message: { author: "vane", actions: [{ kind: "books.invoice.due_date", status: "proposed", title: "Set INV-0142 due on 30 October" }] },
    });

    // What it read to answer: the question it ran, its table and how many rows answered.
    expect(answer).toMatchObject({ message: { read: [{ tables: ["SalesInvoice"], rows: 0 }] } });

    const history = await chatHistory(prisma, { companyId: ids.company, userId: ids.user });
    expect(history.map((message) => [message.author, message.text.slice(0, 24)])).toEqual([
      ["person", "Which invoices have no d"],
      ["vane", "INV-0142 has no due date"],
    ]);
    const job = await prisma.vaneJob.findFirstOrThrow({ where: { companyId: ids.company, kind: "chat" } });
    expect(job).toMatchObject({ status: "DONE", trigger: "PERSON", requestedById: ids.user, tokensIn: 2700, tokensOut: 240 });
    expect(await prisma.vaneMessage.findFirstOrThrow({ where: { author: "VANE", userId: ids.user } })).toMatchObject({ jobId: job.id });
  });

  it("keeps the cached prompt the same on every page: where the person is goes in their message, and the turns before are marked", async () => {
    const { client, sent } = claude(reply([text("Pomona's quote is still waiting.")], "end_turn"));
    await chatTurn(prisma, who(), { text: "What next on this deal?", module: "crm", path: "/crm/deals/d1" }, { onEvent: () => {}, client });
    const [request] = sent as unknown as [
      { system: Array<{ text: string; cache_control?: unknown }>; messages: Array<{ role: string; content: unknown }> },
    ];
    expect(request.system.map((block) => block.cache_control ?? null)).toEqual([{ type: "ephemeral", ttl: "1h" }, null]);
    expect(request.system[1]!.text).toContain("James");
    expect(JSON.stringify(request.system)).not.toContain("/crm/deals/d1");
    expect(request.messages.at(-1)).toEqual({ role: "user", content: "[In CRM, on /crm/deals/d1] What next on this deal?" });
    // The first turn's answer, the last of the turns before, carries the mark.
    expect(request.messages.at(-2)).toEqual({
      role: "assistant",
      content: [{ type: "text", text: expect.stringContaining("INV-0142 has no due date"), cache_control: { type: "ephemeral" } }],
    });
  });

  it("will not start a second turn while the first still runs", async () => {
    const running = await prisma.vaneJob.create({
      data: { companyId: ids.company, key: `chat:${randomUUID()}`, kind: "chat", label: "x", trigger: "PERSON", requestedById: ids.user, status: "RUNNING", startedAt: new Date() },
    });
    const events: ChatEvent[] = [];
    await chatTurn(prisma, who(), { text: "And the rest?" }, { onEvent: (event) => events.push(event), client: claude().client });
    expect(events).toEqual([{ type: "error", error: "Vane is still answering your last message." }]);
    await prisma.vaneJob.delete({ where: { id: running.id } });
  });

  it("asks nothing of Claude while Vane is paused", async () => {
    await prisma.vaneSettings.create({ data: { companyId: ids.company, paused: true } });
    const { client, create } = claude();
    const events: ChatEvent[] = [];
    await chatTurn(prisma, who(), { text: "Anything new?" }, { onEvent: (event) => events.push(event), client });
    expect(events).toEqual([{ type: "error", error: "Vane is paused. Resume it to ask it anything new." }]);
    expect(create).not.toHaveBeenCalled();
  });
});
