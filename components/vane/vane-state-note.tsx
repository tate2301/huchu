import * as React from "react";

import { Button, ButtonLink } from "@/components/core";
import type { VaneStatus } from "@/lib/vane/status";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const day = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

/** What a tool Vane called did, in a person's words. */
const TRIED: Record<string, string> = {
  describe_table: "looked the tables up",
  run_sql: "asked the workspace",
  get_record: "read the records",
  propose_item: "drafted a card",
  propose_plan: "drafted a plan",
};

function triedLine(tools: string[]): string {
  const words = [...new Set(tools.map((tool) => TRIED[tool]).filter(Boolean))];
  if (words.length === 0) return "";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return ` I ${list}.`;
}

/** The state Vane is in when it is not simply working or watching, as the panel's head names it. */
export function vaneStateLabel(status: VaneStatus): string | null {
  if (status.paused) return "Paused";
  if (status.overAllowance) return "Over the allowance";
  if (status.unreachable) return "Cannot reach the service";
  return null;
}

/**
 * Why Vane is not working as usual (the Vane's states board), in plain words
 * with a way on: paused (Resume Vane), over the allowance (See this month),
 * could not work out its last job (what it tried), and cannot reach the
 * service (when it last worked, when it tries again). Cards, plans and drafts
 * already made always stay. Nothing when none of these holds.
 */
export function VaneStateNote({
  status,
  canResume,
  onResume,
  resuming = false,
}: {
  status: VaneStatus;
  canResume: boolean;
  onResume?: () => void;
  resuming?: boolean;
}) {
  let title: string;
  let line: string;
  let action: React.ReactNode = null;

  if (status.paused) {
    title = status.pausedAt ? `Paused at ${time(status.pausedAt)}` : "Vane is paused";
    line = "Nothing new is read or drafted until someone resumes.";
    if (canResume && onResume) {
      action = (
        <Button icon="run" busy={resuming} onClick={onResume}>
          Resume Vane
        </Button>
      );
    }
  } else if (status.overAllowance) {
    const { used, allowance, resetsOn } = status.overAllowance;
    title = `${used.toLocaleString("en-GB")} of ${allowance.toLocaleString("en-GB")} jobs this month`;
    line = `New jobs start again on ${day(resetsOn)}. Plans already started finish.`;
    action = (
      <ButtonLink href="/management/vane" icon="reports">
        See this month
      </ButtonLink>
    );
  } else if (status.stuck) {
    title = "I could not work this out";
    line = `${status.stuck.label}: ${status.stuck.error}${triedLine(status.stuck.tried)}`;
  } else if (status.unreachable) {
    title = "Vane cannot work just now";
    line = `${status.lastWorkedAt ? `Last worked at ${time(status.lastWorkedAt)}. ` : ""}It tries again on its own every few minutes.`;
  } else {
    return null;
  }

  return (
    <div
      role="status"
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "var(--space-8)", padding: "var(--space-24) var(--space-16)" }}
    >
      <span style={{ fontSize: "var(--text-16)", fontWeight: 600, color: "var(--color-ink)" }}>{title}</span>
      <span style={{ color: "var(--color-ink-2)" }}>{line}</span>
      {status.unreachable && status.nextTryAt && !status.paused && !status.overAllowance && !status.stuck ? (
        <span className="muted">Next try {time(status.nextTryAt)}</span>
      ) : null}
      {action}
    </div>
  );
}
