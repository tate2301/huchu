/**
 * Checks that this environment can reach Claude for Vane: the key in
 * `ANTHROPIC_API_KEY` is accepted and the model in `VANE_MODEL` answers.
 * Sends one short request and prints who answered and what it cost.
 *
 *   pnpm vane:ping
 */
import "dotenv/config";

import { askClaude, VaneError } from "@/lib/vane/claude";

async function main() {
  try {
    const answer = await askClaude({
      system: "You check that a connection works. Answer in one short sentence.",
      messages: [{ role: "user", content: "Say that Vane can reach you." }],
      maxTokens: 2_000,
    });
    console.log(`[vane-ping] ${answer.model} answered: ${answer.text}`);
    console.log(`[vane-ping] tokens in ${answer.usage.input}, out ${answer.usage.output}`);
  } catch (error) {
    if (error instanceof VaneError) {
      console.error(`[vane-ping] ${error.code}${error.retryable ? " (try again later)" : ""}: ${error.message}`);
    } else {
      console.error("[vane-ping] failed", error);
    }
    process.exitCode = 1;
  }
}

void main();
