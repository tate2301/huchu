"use client";

import * as React from "react";

import { Button, ButtonLink, Drawer } from "@/components/core";
import type { VaneState } from "@/lib/vane/pages";

import { clock, longDate, when } from "./format";

/** The word beside Vane's name: Paused, Over the allowance, Cannot reach the service, or Working. */
export function stateWord(state: VaneState | null, working: boolean): { text: string; live: boolean } {
  if (state?.kind === "paused") return { text: "Paused", live: false };
  if (state?.kind === "allowance") return { text: "Over the allowance", live: false };
  if (state?.kind === "unreachable") return { text: "Cannot reach the service", live: false };
  return working ? { text: "Working", live: true } : { text: "Watching", live: false };
}

/**
 * Vane's state, said once, above what it has for you (PageVaneStates): paused,
 * over the monthly allowance, unable to reach the service, or unable to work
 * out the last job. Cards, plans and drafts already made always stay.
 */
export function VaneStateNotice({
  state,
  canPause,
  onResume,
  resuming = false,
}: {
  state: VaneState;
  canPause: boolean;
  onResume?: () => void;
  resuming?: boolean;
}) {
  const [tried, setTried] = React.useState(false);
  let title: string;
  let text: React.ReactNode;
  let action: React.ReactNode = null;
  let note: React.ReactNode = null;
  switch (state.kind) {
    case "paused":
      title = state.since ? `Paused, ${when(state.since)}` : "Paused";
      text = "Nothing new is read or drafted until someone resumes.";
      action =
        canPause && onResume ? (
          <Button icon="run" busy={resuming} onClick={onResume}>
            Resume Vane
          </Button>
        ) : (
          <span className="muted">A manager can resume it.</span>
        );
      break;
    case "allowance":
      title = `${state.used.toLocaleString("en-GB")} of ${state.allowance.toLocaleString("en-GB")} jobs this month`;
      text = `New jobs start again on ${longDate(state.resetsOn)}. The job running now finishes.`;
      action = (
        <ButtonLink href="/management/vane" icon="chev">
          See this month
        </ButtonLink>
      );
      break;
    case "unreachable":
      title = "Vane cannot work just now";
      text = `${state.lastWorkedAt ? `Last worked at ${when(state.lastWorkedAt)}. ` : ""}It tries again on its own every few minutes.`;
      note = state.nextTry ? <span className="vn-st-n">Next try {clock(state.nextTry)}</span> : null;
      break;
    case "failed":
      title = "I could not work this out";
      text = `${state.label}: ${state.error}`;
      action = (
        <Button icon="table" onClick={() => setTried(true)}>
          Show the rows
        </Button>
      );
      break;
  }
  return (
    <div className="vn-st" role="status">
      <span className="vn-st-t">{title}</span>
      <span className="vn-st-d">{text}</span>
      {note}
      {action ? <div>{action}</div> : null}
      {state.kind === "failed" ? (
        <Drawer open={tried} onOpenChange={setTried} title="What it tried" sub={`${state.label} · ${when(state.at)}`} width={460}>
          <div className="vn-sec">
            <span className="sec-title">Why it stopped</span>
            <p className="vn-st-d">{state.error}</p>
          </div>
          <div className="vn-sec">
            <span className="sec-title">What it tried</span>
            {state.tried.length ? (
              <dl className="attrs">
                {state.tried.map((tool, index) => (
                  <React.Fragment key={`${tool.name}-${index}`}>
                    <dt>{tool.name.replace(/_/g, " ")}</dt>
                    <dd>{tool.ok ? "Answered" : "Refused or failed"}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : (
              <p className="vn-st-d">It stopped before it read anything, so there are no rows to show.</p>
            )}
          </div>
        </Drawer>
      ) : null}
    </div>
  );
}
