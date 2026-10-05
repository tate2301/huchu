import type { Ask } from "@/lib/workspace/ask";

/**
 * Unpair on a till (10-setup 5.5, inferred). With a shift open on it the
 * server refuses, so the body is that sentence and only "Keep it" is offered.
 */
export function unpairAsk(till: string, device: string, refusal: string | null = null): Ask {
  return {
    title: `Unpair ${till}?`,
    body:
      refusal ??
      `${device} stops being a till at its next request. Sales it holds offline still come in, flagged for you. The till stays, ready for another device.`,
    keep: "Keep it",
    go: refusal ? "" : "Unpair",
    fill: "bad",
  };
}
