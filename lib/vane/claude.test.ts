/**
 * Vane's way to Claude: the model comes from the environment, a complete
 * answer comes back as text with what it cost, and everything else is a
 * `VaneError` that says whether trying again could help. No request leaves
 * the test; a stand-in plays the SDK client.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { askClaude, VaneError, vaneModel, type MessagesClient } from "@/lib/vane/claude";

const MODEL = "claude-opus-5-5";

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text: "Three invoices are past their terms.", citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 120, output_tokens: 18, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    ...overrides,
  } as Anthropic.Message;
}

function client(answer: () => Promise<Anthropic.Message>) {
  const create = vi.fn(answer);
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

const ASK = { system: "You are Vane.", messages: [{ role: "user" as const, content: "What is owed to us?" }] };

beforeEach(() => {
  vi.stubEnv("VANE_MODEL", MODEL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the model", () => {
  it("is read from VANE_MODEL", () => {
    vi.stubEnv("VANE_MODEL", "  claude-sonnet-5-5 ");
    expect(vaneModel()).toBe("claude-sonnet-5-5");
  });

  it("is a configuration error when VANE_MODEL is not set, before any request", async () => {
    vi.stubEnv("VANE_MODEL", "");
    const { client: stub, create } = client(async () => message());
    await expect(askClaude({ ...ASK, client: stub })).rejects.toMatchObject({ code: "misconfigured", retryable: false });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("a complete answer", () => {
  it("sends the model, the cached system prompt and the conversation", async () => {
    const { client: stub, create } = client(async () => message());
    await askClaude({ ...ASK, maxTokens: 2_000, client: stub });
    expect(create).toHaveBeenCalledWith({
      model: MODEL,
      max_tokens: 2_000,
      system: [{ type: "text", text: "You are Vane.", cache_control: { type: "ephemeral" } }],
      messages: ASK.messages,
    });
  });

  it("comes back as its text, with the tokens it cost", async () => {
    const { client: stub } = client(async () =>
      message({
        content: [
          { type: "thinking", thinking: "", signature: "sig" },
          { type: "text", text: "Three invoices ", citations: null },
          { type: "text", text: "are past their terms.", citations: null },
        ] as Anthropic.ContentBlock[],
      }),
    );
    const result = await askClaude({ ...ASK, client: stub });
    expect(result).toEqual({
      text: "Three invoices are past their terms.",
      model: MODEL,
      usage: { input: 120, output: 18, cacheRead: 900, cacheWrite: 0 },
    });
  });
});

describe("anything that is not a complete answer", () => {
  it("is a refusal when Claude declines", async () => {
    const { client: stub } = client(async () => message({ stop_reason: "refusal", content: [] }));
    await expect(askClaude({ ...ASK, client: stub })).rejects.toMatchObject({ code: "refused", retryable: false });
  });

  it("is cut off when it runs past max tokens", async () => {
    const { client: stub } = client(async () => message({ stop_reason: "max_tokens" }));
    await expect(askClaude({ ...ASK, client: stub })).rejects.toMatchObject({ code: "cut-off", retryable: false });
  });

  it.each([
    ["a rate limit", new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()), "rate-limited", true],
    ["a refused key", new Anthropic.AuthenticationError(401, undefined, "invalid x-api-key", new Headers()), "misconfigured", false],
    ["an unknown model", new Anthropic.NotFoundError(404, undefined, "model not found", new Headers()), "misconfigured", false],
    ["a server error", new Anthropic.InternalServerError(529, undefined, "overloaded", new Headers()), "unavailable", true],
    ["no connection", new Anthropic.APIConnectionError({ message: "socket hang up" }), "unavailable", true],
  ])("says what went wrong after %s", async (_name, thrown, code, retryable) => {
    const { client: stub } = client(async () => {
      throw thrown;
    });
    const error = await askClaude({ ...ASK, client: stub }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VaneError);
    expect(error).toMatchObject({ code, retryable });
  });
});
