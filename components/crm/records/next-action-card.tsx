"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { CheckCircle, ChevronDown, ChevronRight, Clock, Plus, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type NextAction = {
  /** Stable across renders, so promoting one keeps its place in the queue. */
  id: string;
  icon: LucideIcon;
  title: string;
  /** The facts behind it, in mono where they are references and figures. */
  meta?: ReactNode;
  /** "Due today", "Fri 27 Nov" — when, in the reader's words. */
  due?: string | null;
  /** Past its time or the record is drifting. Draws the due line amber. */
  urgent?: boolean;
  /** The verb that does it, if the page can do it in one press. */
  act?: { label: string; onAct: () => void; disabled?: boolean; disabledReason?: string } | null;
  /** Ticks it off, for the actions that are tasks somebody can finish. */
  onDone?: (() => void) | null;
};

/** When a task is due, the way the card says it: "Due today", "3 days late". */
export function dueText(iso: string): { text: string; late: boolean } {
  const due = new Date(iso);
  const today = new Date();
  const days = Math.round(
    (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86_400_000,
  );
  if (days === 0) return { text: "Due today", late: false };
  if (days === 1) return { text: "Due tomorrow", late: false };
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} late`, late: true };
  return {
    text: due.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
    late: false,
  };
}

/**
 * What to do next on this record, and what is queued behind it.
 *
 * One action at a time, at the head of the conversation: its title, why, when
 * it is due, and the verb that does it. Anything else waiting is "N more",
 * which opens the queue in place; picking one from it brings it to the head,
 * and finishing the head brings up the next. A queue shown all at once is a
 * to-do list, and a to-do list is the Tasks section's job.
 *
 * Done is only offered on what can be done — a task. A step the record works
 * out for itself ("quote it, it has been visited") is done by doing it, and a
 * button that hid it without doing it would be a lie.
 */
export function NextActionCard({
  actions,
  onNewTask,
}: {
  actions: NextAction[];
  /** Offered when nothing is left. */
  onNewTask?: () => void;
}) {
  const [promoted, setPromoted] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const ordered = (() => {
    const index = actions.findIndex((action) => action.id === promoted);
    if (index <= 0) return actions;
    return [actions[index], ...actions.slice(0, index), ...actions.slice(index + 1)];
  })();
  const [head, ...rest] = ordered;

  if (!head) {
    return (
      <section className="rec-na" data-tone="ok">
        <div className="rec-na-row">
          <span className="rec-na-ic" aria-hidden="true">
            <CheckCircle />
          </span>
          <div className="rec-na-main">
            <div className="rec-na-line">
              <span className="rec-na-eb">Next action</span>
              <h2 className="rec-na-title">Nothing left to do</h2>
            </div>
          </div>
          {onNewTask ? (
            <div className="rec-na-side">
              <Button size="sm" variant="secondary" onClick={onNewTask}>
                <Plus className="size-4" aria-hidden="true" />
                New task
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  const Icon = head.icon;

  const done = () => {
    if (!head.onDone) return;
    // Out to the left, then the next one comes in from the right.
    setLeaving(true);
    window.setTimeout(() => {
      setLeaving(false);
      head.onDone?.();
    }, 180);
  };

  return (
    <section className={cn("rec-na", rest.length > 0 && "has-queue")} data-tone={head.urgent ? "warn" : undefined}>
      <div key={head.id} className={cn("rec-na-row", leaving ? "is-leaving" : "is-entering")}>
        <span className="rec-na-ic" aria-hidden="true">
          <Icon />
        </span>
        <div className="rec-na-main">
          <div className="rec-na-line">
            <span className="rec-na-eb">Next action</span>
            <h2 className="rec-na-title">{head.title}</h2>
          </div>
          {head.meta || head.due ? (
            <div className="rec-na-sub">
              {head.meta ? <span className="rec-na-meta">{head.meta}</span> : null}
              {head.meta && head.due ? <i aria-hidden="true">·</i> : null}
              {head.due ? (
                <span className="rec-na-due">
                  <Clock aria-hidden="true" />
                  {head.due}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="rec-na-side">
          {rest.length > 0 ? (
            <button
              type="button"
              className="rec-na-tg"
              aria-expanded={queueOpen}
              onClick={() => setQueueOpen((open) => !open)}
            >
              <ChevronDown className={cn("rec-chev", queueOpen && "is-up")} aria-hidden="true" />
              {rest.length} more
            </button>
          ) : null}
          <span className="rec-bgroup">
            {head.onDone ? (
              <Button size="sm" variant="secondary" onClick={done} title="Mark done">
                <CheckCircle className="size-4 text-[var(--color-ok)]" aria-hidden="true" />
                Done
              </Button>
            ) : null}
            {head.act ? (
              <Button
                size="sm"
                variant="primary"
                onClick={head.act.onAct}
                disabled={head.act.disabled}
                title={head.act.disabled ? head.act.disabledReason : undefined}
              >
                {head.act.label}
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </span>
        </div>
      </div>

      {rest.length > 0 ? (
        <div className={cn("rec-na-list", queueOpen && "is-open")} inert={!queueOpen}>
          <div>
            <div className="rec-na-in">
              {rest.map((action) => {
                const RowIcon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    className="rec-na-r"
                    onClick={() => setPromoted(action.id)}
                  >
                    <RowIcon className="rec-na-r-i" aria-hidden="true" />
                    <b>{action.title}</b>
                    {action.due ? (
                      <span className={cn("rec-na-r-d", action.urgent && "is-urgent")}>{action.due}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
