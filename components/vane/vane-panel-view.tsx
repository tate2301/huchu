"use client";

import * as React from "react";

import { Button, Icon, Kbd, VaneMark } from "@/components/core";
import type { VaneCard, VanePanel } from "@/lib/vane/panel";

import { VanePlanCardView } from "./vane-plan-card";
import { vaneStateLabel, VaneStateNote } from "./vane-state-note";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });


/**
 * The Vane panel (design/core-modules/spec/vane.md), 400px on the right of any
 * module: its head with Working or Paused, Pause and Close; what it is doing
 * now; For you, this module's cards first; plans broken down; what it did
 * while you were away; and Give Vane a job at the foot (Ctrl J).
 *
 * Pure: the container feeds it, and the fixture routes feed it the drawn data.
 */
export function VanePanelView({
  panel,
  canPause,
  onPause,
  onClose,
  onAct,
  onNotNow,
  onGiveJob,
  giving = false,
}: {
  panel: VanePanel;
  canPause: boolean;
  onPause?: (paused: boolean) => void;
  onClose: () => void;
  onAct: (card: VaneCard, target?: string) => void;
  onNotNow: (card: VaneCard) => void;
  onGiveJob: (text: string) => void;
  giving?: boolean;
}) {
  const { status, items, plans, done } = panel;
  const [job, setJob] = React.useState("");
  const jobRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "j" && (event.ctrlKey || event.metaKey) && !event.altKey) {
        event.preventDefault();
        jobRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const give = () => {
    const text = job.trim();
    if (text.length < 3 || giving) return;
    onGiveJob(text);
    setJob("");
  };

  return (
    <aside className="ask" aria-label="Vane">
      <div className="ask-h">
        <VaneMark />
        <b>Vane</b>
        {vaneStateLabel(status) ? (
          <span className="muted">{vaneStateLabel(status)}</span>
        ) : status.working ? (
          <span className="live">Working</span>
        ) : (
          <span className="muted">Watching</span>
        )}
        <div className="tb-r">
          {canPause && onPause ? (
            <Button
              variant="quiet"
              iconOnly
              icon={status.paused ? "run" : "pause"}
              label={status.paused ? "Resume Vane" : "Pause Vane"}
              onClick={() => onPause(!status.paused)}
            />
          ) : null}
          <Button variant="quiet" iconOnly icon="x" label="Close Vane" onClick={onClose} />
        </div>
      </div>

      <div className="ask-b">
        <VaneStateNote status={status} canResume={canPause && Boolean(onPause)} onResume={() => onPause?.(false)} />
        {status.now && !status.paused ? (
          <div className="vn-now">
            <span className="live-d" aria-hidden="true" />
            <span className="truncate">{status.now.label}</span>
            {status.now.progress ? <span className="muted">{status.now.progress}</span> : null}
          </div>
        ) : null}

        <div className="vs">
          For you <span className="pn-n">{items.length}</span>
        </div>
        {items.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Nothing waits for you. Vane puts what needs you here.
          </p>
        ) : (
          items.map((card, index) => (
            <article key={card.id} className={card.kind === "issue" ? "vc is-issue" : "vc"}>
              <div className="vc-k">
                <Icon name={card.kind === "issue" ? "issue" : "suggestion"} />
                <span>{card.kind === "issue" ? "Issue" : "Suggestion"}</span>
                <span className="muted">{card.source}</span>
                <Button variant="quiet" iconOnly icon="x" label="Not now" className="vc-x" onClick={() => onNotNow(card)} />
              </div>
              <h3>{card.headline}</h3>
              <p>{card.body}</p>
              {card.action ? (
                <div className="vc-a">
                  <Button
                    variant={index === 0 && card.action.shortcut ? "primary" : "default"}
                    icon={card.action.type === "send" ? "send" : card.action.type === "review" ? "eye" : "chev"}
                    shortcut={index === 0 ? card.action.shortcut : undefined}
                    onClick={() => onAct(card)}
                  >
                    {card.action.label}
                  </Button>
                  {card.action.also ? (
                    <Button icon="eye" onClick={() => onAct(card, card.action?.also?.target)}>
                      {card.action.also.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))
        )}

        {plans.length > 0 ? <div className="vs">Broken down</div> : null}
        {plans.map((plan) => (
          <VanePlanCardView key={plan.id} plan={plan} />
        ))}

        {done.length > 0 ? <div className="vs">Done while you were away</div> : null}
        {done.map((entry) => (
          <div key={entry.id} className="vd">
            <Icon name="done" />
            <span className="truncate">{entry.text}</span>
            <span className="muted">{time(entry.at)}</span>
          </div>
        ))}
      </div>

      <form
        className="ask-c"
        onSubmit={(event) => {
          event.preventDefault();
          give();
        }}
      >
        <label className="input-wrap ask-in">
          <input
            ref={jobRef}
            type="text"
            aria-label="Give Vane a job"
            aria-keyshortcuts="Control+J"
            placeholder="Give Vane a job"
            value={job}
            onChange={(event) => setJob(event.target.value)}
          />
          {job ? null : <Kbd>Ctrl J</Kbd>}
        </label>
        <Button iconOnly icon="send" label="Hand it over" type="submit" busy={giving} disabled={job.trim().length < 3} />
      </form>
    </aside>
  );
}
