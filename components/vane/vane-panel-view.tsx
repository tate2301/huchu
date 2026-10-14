"use client";

import * as React from "react";

import { Button, ButtonLink, Icon, VaneMark } from "@/components/core";
import type { VaneActionView } from "@/lib/vane/actions/engine";
import type { VaneChatMessage } from "@/lib/vane/chat";
import type { VaneCard, VanePanel } from "@/lib/vane/panel";
import type { VaneStatus } from "@/lib/vane/status";

import { NotNowMenu } from "./not-now-menu";
import { VaneActionList } from "./vane-action-list";
import { VaneModuleTag } from "./vane-module";
import type { VaneSuggestion } from "./vane-panel";
import { VanePlanCardView } from "./vane-plan-card";
import { vaneStateLabel, VaneStateNote } from "./vane-state-note";
import { VaneText } from "./vane-text";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "CrmDeal" → "deals": a table as a person names it. */
function tableWords(table: string): string {
  const words = table.replace(/^(Crm|Sales|Retail|Vane)(?=[A-Z])/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.endsWith("y") ? `${words.slice(0, -1)}ies` : words.endsWith("s") ? words : `${words}s`;
}

/** "deals, activities · 11 rows; customers · 3 rows". */
function readLine(read: VaneChatMessage["read"]): string {
  return read
    .map((question) => `${question.tables.map(tableWords).join(", ")} · ${question.rows.toLocaleString("en-GB")} ${question.rows === 1 ? "row" : "rows"}`)
    .join("; ");
}

export type ActionDecision = { approve: false } | { approve: true; changes: Record<string, unknown> };

/** Vane's state in the header, as a dot in its tone: working (pulsing), watching, or why not. */
function StateDot({ status, held }: { status: VaneStatus; held: boolean }) {
  if (held || (status.working && !vaneStateLabel(status))) return <span className="live">Working</span>;
  if (status.paused || status.overAllowance) return <span className="status status-warning">{vaneStateLabel(status)}</span>;
  if (status.unreachable) return <span className="status status-danger">{vaneStateLabel(status)}</span>;
  return <span className="status status-success">Watching</span>;
}

/**
 * The Vane panel (design/core-modules/spec/vane.md), 400px on the right of any
 * page, opened from Vane's mark in the rail or with Ctrl J. Top to bottom:
 * its state; what it is doing now; For you, this module's cards first, each
 * with the actions Vane proposes to approve or deny there and then; plans
 * broken down; what it did while you were away; then the conversation, with
 * the actions on each answer. At the foot, suggestions (always) and the box
 * to ask Vane or give it a job. While Vane answers, the panel is held: it
 * says what Vane is doing and nothing in it can be pressed.
 *
 * Pure: the container feeds it, and the fixture routes feed it the drawn data.
 */
export function VanePanelView({
  panel,
  chat,
  suggestions,
  working = null,
  askError = null,
  focusKey = 0,
  draft = null,
  canPause,
  deciding = null,
  onPause,
  onClose,
  onAct,
  onMute,
  onDecide,
  onAsk,
}: {
  panel: VanePanel;
  chat: VaneChatMessage[];
  /** What to ask next: always some. */
  suggestions: VaneSuggestion[];
  /** What Vane is doing while it answers; the panel is held while it is set. */
  working?: string | null;
  askError?: string | null;
  /** Bumped by Ctrl J: the box takes the focus. */
  focusKey?: number;
  /** Words a page put in the box ("Ask Vane about this deal"): they replace what is there, for the person to send. */
  draft?: { text: string; key: number } | null;
  canPause: boolean;
  /** The action being decided now. */
  deciding?: string | null;
  onPause?: (paused: boolean) => void;
  onClose: () => void;
  onAct: (card: VaneCard, target?: string) => void;
  onMute: (card: VaneCard, reason: string) => void;
  onDecide: (action: VaneActionView, decision: ActionDecision) => void;
  onAsk: (text: string) => void;
}) {
  const { status, items, plans, done } = panel;
  const [text, setText] = React.useState("");
  const box = React.useRef<HTMLTextAreaElement>(null);
  const body = React.useRef<HTMLDivElement>(null);
  const held = working !== null;

  React.useEffect(() => {
    if (focusKey > 0) box.current?.focus();
  }, [focusKey]);

  const draftKey = draft?.key ?? 0;
  const draftText = draft?.text ?? "";
  React.useEffect(() => {
    if (!draftKey) return;
    setText(draftText);
    box.current?.focus();
  }, [draftKey, draftText]);

  // The newest turn, or what Vane is doing, in view; not on opening, which starts at the cards.
  const seen = React.useRef(chat.length);
  React.useEffect(() => {
    if (chat.length === seen.current && working === null) return;
    seen.current = chat.length;
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, working]);

  const ask = (words: string) => {
    const request = words.trim();
    if (!request || held) return;
    onAsk(request);
    setText("");
  };

  return (
    <aside className="ask" aria-label="Vane" aria-busy={held}>
      <div className="ask-h">
        <VaneMark size={20} />
        <b>Vane</b>
        <StateDot status={status} held={held} />
        <div className="tb-r">
          <ButtonLink href="/vane" variant="quiet" iconOnly icon="foryou" label="Open Vane's pages" />
          {canPause && onPause ? (
            <Button
              variant="quiet"
              iconOnly
              icon={status.paused ? "run" : "pause"}
              label={status.paused ? "Resume Vane" : "Pause Vane"}
              disabled={held}
              onClick={() => onPause(!status.paused)}
            />
          ) : null}
          <Button variant="quiet" iconOnly icon="x" label="Close Vane" onClick={onClose} />
        </div>
      </div>

      <div className="ask-b" ref={body}>
        <fieldset
          disabled={held}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-12)", border: 0, padding: 0, margin: 0, minWidth: 0, opacity: held ? 0.6 : 1 }}
        >
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
            <p className="muted" style={{ fontSize: "var(--text-13)", margin: 0 }}>
              Nothing waits for you. Ask Vane below, or pick one of its suggestions.
            </p>
          ) : (
            items.map((card, index) => (
              <article
                key={card.id}
                className={card.kind === "issue" ? "vc is-issue" : "vc"}
                data-module={card.module}
                aria-labelledby={`vane-panel-${card.id}`}
              >
                <div className="vc-k">
                  <span className="vn-kind">
                    <Icon name={card.kind === "issue" ? "issue" : "suggestion"} />
                    {card.kind === "issue" ? "Issue" : "Suggestion"}
                  </span>
                  <VaneModuleTag module={card.module} name={card.source} />
                  <span className="vn-when">{time(card.createdAt)}</span>
                  <span style={{ marginLeft: "auto" }}>
                    <NotNowMenu describedBy={`vane-panel-${card.id}`} onMute={(reason) => onMute(card, reason)} />
                  </span>
                </div>
                <h3 id={`vane-panel-${card.id}`}>{card.headline}</h3>
                <p>{card.body}</p>
                {card.action ? (
                  <div className="vc-a">
                    <Button
                      variant={index === 0 && card.actions.every((action) => action.status !== "proposed") ? "primary" : "default"}
                      icon={card.action.type === "send" ? "send" : card.action.type === "review" ? "eye" : "chev"}
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
                <VaneActionList actions={card.actions} disabled={held} deciding={deciding} onDecide={onDecide} />
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

          {chat.length > 0 ? <div className="vs">You and Vane</div> : null}
          {chat.map((message) =>
            message.author === "person" ? (
              <div key={message.id} className="vm vm-me" title={`You, ${time(message.createdAt)}`}>
                <div className="vm-b">{message.text}</div>
              </div>
            ) : (
              <div key={message.id} className="vm vm-it" title={`Vane, ${time(message.createdAt)}`}>
                <VaneMark size={20} />
                <div className="vm-c">
                  <div className="vm-b">
                    <VaneText text={message.text} />
                  </div>
                  <VaneActionList actions={message.actions} disabled={held} deciding={deciding} onDecide={onDecide} />
                  {message.read.length > 0 ? <p className="vm-read">What I read: {readLine(message.read)}</p> : null}
                </div>
              </div>
            ),
          )}
        </fieldset>

        {held ? (
          <div className="vm vm-it vm-w" role="status" aria-live="polite">
            <VaneMark size={20} />
            <span className="vm-b">{working}…</span>
          </div>
        ) : null}
        {askError ? (
          <p role="alert" className="vm-err">
            <Icon name="warn" />
            <span>{askError}</span>
          </p>
        ) : null}
      </div>

      <form
        className="ask-c"
        onSubmit={(event) => {
          event.preventDefault();
          ask(text);
        }}
      >
        <div className="vn-sug" role="group" aria-label="Suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.text}
              type="button"
              data-module={suggestion.module ?? "vane"}
              disabled={held}
              title={suggestion.text}
              onClick={() => ask(suggestion.text)}
            >
              <Icon name={suggestion.icon} />
              <span>{suggestion.text}</span>
            </button>
          ))}
        </div>
        <div className="vn-box">
          <textarea
            ref={box}
            rows={1}
            aria-label="Ask Vane or give it a job"
            aria-keyshortcuts="Control+J Meta+J"
            placeholder="Ask Vane or give it a job"
            value={text}
            disabled={held}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask(text);
              }
            }}
          />
          <div className="vn-box-f">
            <span>{held ? "Wait for Vane" : "Vane asks before it changes anything. Ctrl J"}</span>
            <button type="submit" className="vn-send" aria-label="Ask Vane" aria-keyshortcuts="Enter" disabled={held || !text.trim()}>
              <Icon name="send" />
            </button>
          </div>
        </div>
      </form>
    </aside>
  );
}
