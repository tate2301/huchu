"use client";

import * as React from "react";

import { Button, ButtonLink, Icon, TextArea, VaneMark } from "@/components/core";
import type { VaneActionView } from "@/lib/vane/actions/engine";
import type { VaneChatMessage } from "@/lib/vane/chat";
import type { VaneCard, VanePanel } from "@/lib/vane/panel";

import { NotNowMenu } from "./not-now-menu";
import { VaneActionList } from "./vane-action-list";
import { VanePlanCardView } from "./vane-plan-card";
import { vaneStateLabel, VaneStateNote } from "./vane-state-note";
import { VaneText } from "./vane-text";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

export type ActionDecision = { approve: false } | { approve: true; changes: Record<string, unknown> };

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
  suggestions: string[];
  /** What Vane is doing while it answers; the panel is held while it is set. */
  working?: string | null;
  askError?: string | null;
  /** Bumped by Ctrl J: the box takes the focus. */
  focusKey?: number;
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
        <VaneMark />
        <b>Vane</b>
        {held ? (
          <span className="live">Working</span>
        ) : vaneStateLabel(status) ? (
          <span className="muted">{vaneStateLabel(status)}</span>
        ) : status.working ? (
          <span className="live">Working</span>
        ) : (
          <span className="muted">Watching</span>
        )}
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
              <article key={card.id} className={card.kind === "issue" ? "vc is-issue" : "vc"} aria-labelledby={`vane-panel-${card.id}`}>
                <div className="vc-k">
                  <Icon name={card.kind === "issue" ? "issue" : "suggestion"} />
                  <span>{card.kind === "issue" ? "Issue" : "Suggestion"}</span>
                  <span className="muted">{card.source}</span>
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
              <div
                key={message.id}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "85%",
                  padding: "var(--space-8) var(--space-12)",
                  borderRadius: 12,
                  background: "var(--color-ground)",
                  color: "var(--color-ink)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {message.text}
              </div>
            ) : (
              <div key={message.id} style={{ display: "flex", gap: "var(--space-8)", alignItems: "flex-start" }}>
                <span style={{ flex: "none", marginTop: 2 }}>
                  <VaneMark />
                </span>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "var(--space-8)", color: "var(--color-ink-2)" }}>
                  <VaneText text={message.text} />
                  <VaneActionList actions={message.actions} disabled={held} deciding={deciding} onDecide={onDecide} />
                </div>
              </div>
            ),
          )}
        </fieldset>

        {held ? (
          <div className="vn-now" role="status" aria-live="polite">
            <span className="live-d" aria-hidden="true" />
            <span className="truncate">{working}</span>
            <span className="muted">Wait for Vane</span>
          </div>
        ) : null}
        {askError ? (
          <p role="alert" style={{ margin: 0, color: "var(--color-danger)", fontSize: "var(--text-13)" }}>
            {askError}
          </p>
        ) : null}
      </div>

      <form
        className="ask-c"
        style={{ flexDirection: "column" }}
        onSubmit={(event) => {
          event.preventDefault();
          ask(text);
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-8)" }} aria-label="Suggestions">
          {suggestions.map((suggestion) => (
            <Button key={suggestion} size="sm" disabled={held} onClick={() => ask(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-8)", alignItems: "flex-end" }}>
          <TextArea
            ref={box}
            rows={2}
            className="ask-in"
            aria-label="Ask Vane or give it a job"
            aria-keyshortcuts="Control+J Meta+J"
            placeholder="Ask Vane or give it a job (Ctrl J)"
            value={text}
            disabled={held}
            style={{ resize: "none" }}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask(text);
              }
            }}
          />
          <Button iconOnly icon="send" label="Ask Vane" type="submit" busy={held} disabled={held || !text.trim()} />
        </div>
      </form>
    </aside>
  );
}
