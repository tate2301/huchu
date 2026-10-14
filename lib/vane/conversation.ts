import type Anthropic from "@anthropic-ai/sdk";

import { converse, VaneError, type MessagesClient, type Usage, type VaneSystem } from "./claude";
import { callTool, toolDefinitions, type ToolContext } from "./tools";

/** Turns of Claude in one conversation: tool calls, then the closing answer. */
export const MAX_TURNS = 12;

export type ToolLog = { name: string; ms: number; ok: boolean };

export type ConversationOutcome = { text: string; model: string; usage: Usage; tools: ToolLog[] };

/**
 * One conversation with Claude, run to its end: Vane's tools are called as it
 * asks for them, until it answers in words. A nightly job and a person's chat
 * both run through here. `onTool` hears each call as it starts, so a person
 * waiting in the panel can see what Vane is reading. Throws a `VaneError`
 * when Claude falls short or the deadline passes.
 */
export async function runConversation({
  system,
  messages: start,
  context,
  deadline,
  client,
  onTool,
}: {
  system: VaneSystem;
  messages: Anthropic.MessageParam[];
  context: ToolContext;
  /** Epoch ms by which it must finish. */
  deadline: number;
  client?: MessagesClient;
  onTool?: (name: string, input: unknown) => void;
}): Promise<ConversationOutcome> {
  const tools = toolDefinitions();
  const messages = [...start];
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const log: ToolLog[] = [];
  let model = "";

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const left = deadline - Date.now();
    if (left <= 5_000) throw new VaneError("unavailable", "Vane ran out of time and will try again.");
    const { message, usage: spent } = await converse({ system, messages, tools, timeoutMs: left, client });
    model = message.model;
    usage.input += spent.input;
    usage.output += spent.output;
    usage.cacheRead += spent.cacheRead;
    usage.cacheWrite += spent.cacheWrite;

    // The response goes back unchanged, thinking included.
    messages.push({ role: "assistant", content: message.content });
    const calls = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (message.stop_reason !== "tool_use" || calls.length === 0) {
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();
      return { text, model, usage, tools: log };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      onTool?.(call.name, call.input);
      const started = Date.now();
      const result = await callTool(context, call.name, call.input);
      log.push({ name: call.name, ms: Date.now() - started, ok: result.ok });
      results.push({ type: "tool_result", tool_use_id: call.id, content: result.content, is_error: !result.ok });
    }
    messages.push({ role: "user", content: results });
  }
  throw new VaneError("cut-off", `Vane did not finish in ${MAX_TURNS} turns.`);
}
