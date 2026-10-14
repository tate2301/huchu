import Anthropic from "@anthropic-ai/sdk";

/**
 * Vane's one way to Claude. Server-only: the key never reaches a browser.
 *
 * The key is the SDK's own `ANTHROPIC_API_KEY`, read by the client. The model
 * is `VANE_MODEL` and is never written in code, so a workspace moves to a new
 * model by changing an environment variable, not by a release. Everything
 * else about Vane (what it reads, what it may write) is built on `askClaude`.
 */

export type VaneErrorCode =
  /** VANE_MODEL is not set, or the key or model was refused. A person has to fix the configuration. */
  | "misconfigured"
  /** Too many requests for now. */
  | "rate-limited"
  /** Claude could not be reached, or answered with a server error. */
  | "unavailable"
  /** Claude declined to answer. */
  | "refused"
  /** The answer ran past `maxTokens` and was cut off. */
  | "cut-off";

export class VaneError extends Error {
  readonly code: VaneErrorCode;
  /** Whether the same request may work if it is tried again later. */
  readonly retryable: boolean;

  constructor(code: VaneErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VaneError";
    this.code = code;
    this.retryable = code === "rate-limited" || code === "unavailable";
  }
}

/** The model Vane runs on, from `VANE_MODEL`. */
export function vaneModel(): string {
  const model = process.env.VANE_MODEL?.trim();
  if (!model) throw new VaneError("misconfigured", "VANE_MODEL is not set, so Vane does not know which model to use.");
  return model;
}

/** The part of the SDK client `askClaude` uses, so tests can stand in for it. */
export type MessagesClient = { messages: Pick<Anthropic["messages"], "create"> };

let shared: Anthropic | null = null;

/** One client per server process; it reads `ANTHROPIC_API_KEY` itself. */
export function vaneClient(): MessagesClient {
  shared ??= new Anthropic();
  return shared;
}

export type AskClaudeInput = {
  /** Who Vane is and how it works. Stable across calls, so it is cached. */
  system: string;
  /** The conversation so far; the last message is the person's. */
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  client?: MessagesClient;
};

export type AskClaudeResult = {
  text: string;
  /** The model that answered, as Claude reported it. */
  model: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

/** The SDK's errors, as Vane's: what went wrong and whether to try again. */
function asVaneError(error: unknown): VaneError {
  if (error instanceof VaneError) return error;
  if (error instanceof Anthropic.RateLimitError) {
    return new VaneError("rate-limited", "Claude is taking too many requests just now.", { cause: error });
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.BadRequestError
  ) {
    return new VaneError("misconfigured", `Claude refused the request (${error.status}): ${error.message}`, { cause: error });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new VaneError("unavailable", "Claude could not be reached.", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === "number" ? error.status : 0;
    return status >= 500
      ? new VaneError("unavailable", `Claude answered with a server error (${status}).`, { cause: error })
      : new VaneError("misconfigured", `Claude refused the request (${status}): ${error.message}`, { cause: error });
  }
  return new VaneError("unavailable", error instanceof Error ? error.message : "Claude could not be reached.", { cause: error });
}

/**
 * One request to Claude and its text answer.
 *
 * Throws a `VaneError` for anything that is not a complete answer: a refusal,
 * an answer cut off at `maxTokens`, or a request that failed. Callers decide
 * from `retryable` whether to try again later.
 */
export async function askClaude({ system, messages, maxTokens = 16_000, client = vaneClient() }: AskClaudeInput): Promise<AskClaudeResult> {
  const model = vaneModel();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    });
  } catch (error) {
    throw asVaneError(error);
  }

  if (response.stop_reason === "refusal") {
    throw new VaneError("refused", "Claude declined to answer this.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new VaneError("cut-off", `The answer ran past ${maxTokens} tokens and was cut off.`);
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return {
    text,
    model: response.model,
    usage: {
      input: response.usage.input_tokens ?? 0,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

/**
 * Vane's instructions in two parts, for the prompt cache: `shared` is the same
 * for every job and every chat that reads the same tables (who Vane is, its
 * rules, the tables), so it is cached for an hour and read back at a twentieth
 * of the price; `context` is this job's or this person's (who they are), after it.
 */
export type VaneSystem = { shared: string; context?: string };

/** The 1-hour cache, for what stays the same across workspaces and people. */
const LONG = { type: "ephemeral", ttl: "1h" } as const;

/**
 * The request's cache layout (platform.claude.com/docs/en/build-with-claude/prompt-caching):
 * the tools and the shared instructions are each a 1-hour breakpoint, so a
 * change of context reuses them; the rest of the prompt is cached by the
 * request's own top-level `cache_control` (5 minutes), which follows the last
 * block as the conversation grows. A conversation may mark one more block of
 * its own (a chat's earlier turns). Four breakpoints at most; the 1-hour ones
 * come first, as the API requires.
 */
export function cachedPrompt(system: VaneSystem, tools: Anthropic.Tool[]) {
  return {
    system: [
      { type: "text" as const, text: system.shared, cache_control: LONG },
      ...(system.context ? [{ type: "text" as const, text: system.context }] : []),
    ],
    tools: tools.map((tool, index) => (index === tools.length - 1 ? { ...tool, cache_control: LONG } : tool)),
  };
}

export type ConverseInput = {
  system: VaneSystem;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  maxTokens?: number;
  /** How long one request may take before it counts as Claude being unreachable. */
  timeoutMs?: number;
  client?: MessagesClient;
};

export type Usage = AskClaudeResult["usage"];

/**
 * One turn of a conversation in which Claude may call tools: the whole
 * response (text, tool calls and thinking, to be sent back unchanged) and
 * what it cost. A refusal or an answer cut off at `maxTokens` is a
 * `VaneError`, as with `askClaude`.
 *
 * The prompt is cached as `cachedPrompt` lays it out: each turn of a job pays
 * the full rate only for what the turn before added, and a new job or chat
 * reads the tools and the shared instructions back from the cache.
 */
export async function converse({
  system,
  messages,
  tools,
  maxTokens = 16_000,
  timeoutMs = 60_000,
  client = vaneClient(),
}: ConverseInput): Promise<{ message: Anthropic.Message; usage: Usage }> {
  const model = vaneModel();
  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model,
        max_tokens: maxTokens,
        ...cachedPrompt(system, tools),
        messages,
        cache_control: { type: "ephemeral" },
        // Background work across a handful of tool calls: medium is where quality holds and spend stays low.
        output_config: { effort: "medium" },
      },
      { timeout: timeoutMs },
    );
  } catch (error) {
    throw asVaneError(error);
  }
  if (message.stop_reason === "refusal") throw new VaneError("refused", "Claude declined to answer this.");
  if (message.stop_reason === "max_tokens") throw new VaneError("cut-off", `The answer ran past ${maxTokens} tokens and was cut off.`);
  return {
    message,
    usage: {
      input: message.usage.input_tokens ?? 0,
      output: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
