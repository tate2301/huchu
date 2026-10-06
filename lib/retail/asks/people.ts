import type { ReportRow } from "@/lib/reports/types";
import type { Ask } from "@/lib/workspace/ask";

import type { ListActionRun } from "./runs";

/**
 * Staff and PINs' asks (80-admin 5.3, 5.5; **Defined here**): removing
 * access, for one person and for several, and new PINs for several; the
 * toasts after; and the hand-over list when WhatsApp could not take the PINs.
 */

/** "Remove access for Farai Moyo?"; the shift sentence only when they have one open. */
export function removeAccessAsk(name: string, openShift: string | null): Ask {
  return {
    title: `Remove access for ${name}?`,
    body: openShift
      ? `They can no longer sign in or use a till PIN. ${openShift} is closed without a count first, for a manager to sign off. Their sales and history stay.`
      : "They can no longer sign in or use a till PIN. An open shift of theirs is closed without a count first, for a manager to sign off. Their sales and history stay.",
    keep: "Keep access",
    go: "Remove access",
    fill: "bad",
  };
}

export function removeAccessManyAsk(count: number): Ask {
  return {
    title: `Remove access for ${count} ${count === 1 ? "person" : "people"}?`,
    body: "They can no longer sign in or use a till PIN. Their open shifts are closed without a count first. Their sales and history stay.",
    keep: "Keep access",
    go: "Remove access",
    fill: "bad",
  };
}

export function resetPinsAsk(count: number): Ask {
  return {
    title: `Send new PINs to ${count} ${count === 1 ? "person" : "people"}?`,
    body: "Each gets a new PIN on WhatsApp and chooses their own the first time they use it. Their old PINs stop working now.",
    keep: "Keep them",
    go: "Send new PINs",
    fill: "action",
  };
}

/** "Farai Moyo can no longer get in." / "… SH-00244 was closed without a count." */
export function removedToast(name: string, closedShifts: string[]): string {
  if (closedShifts.length === 0) return `${name} can no longer get in.`;
  const list = closedShifts.join(", ");
  return `${name} can no longer get in. ${list} ${closedShifts.length === 1 ? "was" : "were"} closed without a count.`;
}

type Skipped = { id: string; name: string; why: string };

/** A skip in a sentence: "Ruvimbo Chari has no PIN to reset." */
export function skipSentence(skip: Skipped): string {
  switch (skip.why) {
    case "No PIN to reset.":
      return `${skip.name} has no PIN to reset.`;
    case "No access.":
      return `${skip.name} has no access.`;
    case "No phone.":
      return `${skip.name} has no phone.`;
    default:
      return `${skip.name}: ${skip.why}`;
  }
}

/** "3 new PINs sent." or "2 new PINs sent. Ruvimbo Chari has no PIN to reset." */
export function pinsToast(sent: number, skipped: Skipped[]): string {
  const head = `${sent} new ${sent === 1 ? "PIN" : "PINs"} sent.`;
  return skipped[0] ? `${head} ${skipSentence(skipped[0])}` : head;
}

/** The PINs WhatsApp did not take, for whoever sent them: one line each, "Farai Moyo · 4 8 2 9". */
export function pinsHandOverAsk(handOver: Array<{ name: string; pin: string }>): Ask {
  const lines = handOver.map((entry) => `${entry.name} · ${entry.pin.split("").join(" ")}`).join("\n");
  const who = handOver.length === 1 ? handOver[0]!.name : "them";
  return {
    title: "Give these PINs yourself",
    body: `WhatsApp is not set up, so give ${who} these yourself. They are not shown again.\n\n${lines}`,
    keep: "Done",
    go: "",
    fill: "action",
  };
}

/**
 * "Send the invite again" from the row menu when WhatsApp did not take it:
 * the new link (and a PIN they never used) for whoever sent it, shown once —
 * the person sheet's hand-over panel, as a dialog over the list.
 */
export function inviteHandOverAsk(name: string, handOver: { link: string | null; pin: string | null }, error?: string): Ask {
  const why = !error || error === "WhatsApp is not set up" ? "WhatsApp is not set up" : `WhatsApp did not take it (${error})`;
  const both = Boolean(handOver.link && handOver.pin);
  const lines = [
    ...(handOver.link ? [`Link · ${handOver.link}`] : []),
    ...(handOver.pin ? [`Till PIN · ${handOver.pin.split("").join(" ")}`] : []),
  ].join("\n");
  return {
    title: `Give ${name} the invite yourself`,
    body: `${why}, so give ${name} ${both ? "these" : "this"} yourself. ${both ? "They are" : "It is"} not shown again.\n\n${lines}`,
    keep: "Done",
    go: "",
    fill: "action",
  };
}

const text = (row: ReportRow | undefined, key: string) => (typeof row?.[key] === "string" ? (row[key] as string) : "");

type RemoveAnswer = { data?: { name?: string }; closedShifts?: string[] } | null;
type RemoveManyAnswer = { removed?: string[]; skipped?: Skipped[]; closedShifts?: string[] } | null;
type PinsAnswer = { sent?: string[]; skipped?: Skipped[]; handOver?: Array<{ name: string; pin: string }> } | null;
type InviteAnswer = {
  data?: { name?: string };
  sent?: { whatsapp: boolean; error?: string };
  handOver?: { link: string | null; pin: string | null };
} | null;

export const PEOPLE_LIST_RUNS: Record<string, ListActionRun> = {
  removeaccess: {
    ask: (_count, rows) => removeAccessAsk(text(rows[0], "name") || "this person", text(rows[0], "openShift") || null),
    done: (_count, rows, answer) =>
      removedToast(text(rows[0], "name") || "They", (answer as RemoveAnswer)?.closedShifts ?? []),
  },
  removeaccessmany: {
    ask: (count) => removeAccessManyAsk(count),
    done: (_count, _rows, answer) => {
      const result = answer as RemoveManyAnswer;
      const removed = result?.removed?.length ?? 0;
      const shifts = result?.closedShifts?.length ?? 0;
      const head = `${removed} ${removed === 1 ? "person" : "people"} can no longer get in.`;
      const tail = shifts ? ` ${shifts} ${shifts === 1 ? "shift was" : "shifts were"} closed without a count.` : "";
      const skip = result?.skipped?.[0];
      return skip
        ? { title: `${head}${tail} ${skip.name}: ${skip.why}`, variant: "warning" }
        : `${head}${tail}`;
    },
  },
  resetpins: {
    ask: (count) => resetPinsAsk(count),
    done: (_count, _rows, answer) => {
      const result = answer as PinsAnswer;
      const words = pinsToast(result?.sent?.length ?? 0, result?.skipped ?? []);
      return result?.skipped?.length ? { title: words, variant: "warning" } : words;
    },
    after: (answer) => {
      const handOver = (answer as PinsAnswer)?.handOver ?? [];
      return handOver.length > 0 ? pinsHandOverAsk(handOver) : null;
    },
  },
  inviteagain: {
    done: (_count, rows, answer) => {
      const result = answer as InviteAnswer;
      const name = result?.data?.name ?? (text(rows[0], "name") || "them");
      if (result?.sent?.whatsapp) return `Invite sent again to ${name}.`;
      return { title: `The new invite did not reach ${name}. The old link has stopped.`, variant: "warning" };
    },
    // WhatsApp did not take it: the new link (and PIN) for whoever sent it, shown once.
    after: (answer) => {
      const result = answer as InviteAnswer;
      return result?.handOver ? inviteHandOverAsk(result.data?.name ?? "them", result.handOver, result.sent?.error) : null;
    },
  },
};
