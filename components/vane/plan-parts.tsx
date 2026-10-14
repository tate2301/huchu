"use client";

import * as React from "react";

import { Button, Icon } from "@/components/core";
import type { VanePlanDetail } from "@/lib/vane/pages";

/** Who a person's step is for: "You", or the name of the person whose plan it is. */
export function personLabel(plan: Pick<VanePlanDetail, "person">): string {
  return plan.person.you ? "You" : plan.person.name ?? "A person";
}

/**
 * A plan's steps in order: what each found, whose it is, and on a started
 * plan that is yours, a button on each of your steps to tick it.
 */
export function PlanSteps({
  plan,
  onTick,
  busy = false,
  editing,
}: {
  plan: VanePlanDetail;
  onTick?: (planId: string, stepId: string, done: boolean) => void;
  busy?: boolean;
  /** Change the steps: each step's words, and Drop, before Start. */
  editing?: {
    steps: Array<{ id: string; label: string }>;
    onChange: (steps: Array<{ id: string; label: string }>) => void;
  };
}) {
  const canTick = Boolean(onTick) && plan.person.you && (plan.status === "open" || plan.status === "done");
  const ownerOf = (id: string) => plan.steps.find((step) => step.id === id)?.owner ?? "vane";
  if (editing) {
    return (
      <div className="vp">
        <ol>
          {editing.steps.map((step, index) => (
            <li key={step.id} className="is-todo vn-step-edit">
              <Icon name="step-todo" />
              <input
                className="input"
                aria-label={`Step ${index + 1}`}
                value={step.label}
                maxLength={160}
                onChange={(event) =>
                  editing.onChange(editing.steps.map((s) => (s.id === step.id ? { ...s, label: event.target.value } : s)))
                }
              />
              <span className="muted">{ownerOf(step.id) === "vane" ? "Vane" : personLabel(plan)}</span>
              <Button
                variant="quiet"
                iconOnly
                icon="x"
                label={`Drop step ${index + 1}`}
                disabled={editing.steps.length === 1}
                onClick={() => editing.onChange(editing.steps.filter((s) => s.id !== step.id))}
              />
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <div className="vp">
      <ol>
        {plan.steps.map((step) => (
          <li key={step.id} className={`is-${step.status}`}>
            {step.owner === "person" && canTick ? (
              <button
                type="button"
                className="vn-tick"
                aria-pressed={step.status === "done"}
                aria-label={step.status === "done" ? `Mark “${step.label}” not done` : `Mark “${step.label}” done`}
                title={step.status === "done" ? "Mark not done" : "Mark done"}
                disabled={busy}
                onClick={() => onTick?.(plan.id, step.id, step.status !== "done")}
              >
                <Icon name={`step-${step.status}`} />
              </button>
            ) : (
              <Icon name={`step-${step.status}`} />
            )}
            <span>
              {step.label}
              {step.progress ? (
                <>
                  <br />
                  <span className="muted vn-step-d">{step.progress}</span>
                </>
              ) : null}
            </span>
            <span className="muted">{step.owner === "vane" ? "Vane" : personLabel(plan)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const rows = (count: number) => (count === 1 ? "1 row" : `${count} rows`);

/** It reads and It may write: the tables its jobs read, and the only things Vane writes. */
export function PlanFacts({ plan }: { plan: VanePlanDetail }) {
  return (
    <div className="cm-grid2 vn-plan-facts">
      <div className="vn-sec">
        <span className="sec-title">{plan.status === "waiting" ? "It will read" : "It reads"}</span>
        {plan.reads.length ? (
          <dl className="attrs">
            {plan.reads.map((read) => (
              <React.Fragment key={read.table}>
                <dt>{read.label}</dt>
                <dd>{rows(read.rows)}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : (
          <p className="vn-quiet">Nothing yet: each of Vane’s steps reads what it needs when it runs.</p>
        )}
      </div>
      <div className="vn-sec">
        <span className="sec-title">It may write</span>
        <dl className="attrs">
          <dt>Cards</dt>
          <dd>
            on For you, for {plan.person.you ? "you" : plan.person.name ?? "a person"} to act on
            {plan.cards ? ` · ${plan.cards} so far` : ""}
          </dd>
          <dt>This plan</dt>
          <dd>its own steps, ticked as each job finishes</dd>
        </dl>
      </div>
    </div>
  );
}
