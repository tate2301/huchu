"use client";

import * as React from "react";
import Link from "next/link";

import { Empty, Icon, Meter, Pill } from "@/components/core";
import type { VanePlanDetail } from "@/lib/vane/pages";

import { dueLabel, longDate, shortDate, when } from "./format";

/** The pill beside a plan's title: whose step is next, or that it is done. */
export function planPill(plan: Pick<VanePlanDetail, "status" | "current">): { text: string; tone: "info" | "ok" | "plain" } {
  if (plan.status === "done") return { text: "Done", tone: "ok" };
  if (plan.status === "cancelled") return { text: "Stopped", tone: "plain" };
  if (!plan.current) return { text: "Every step done", tone: "ok" };
  return plan.current.owner === "vane"
    ? { text: `Vane is on step ${plan.current.position}`, tone: "info" }
    : { text: `Your turn, step ${plan.current.position}`, tone: "info" };
}

const share = (plan: VanePlanDetail) => (plan.steps.length ? (plan.done / plan.steps.length) * 100 : 0);

/** The note under a plan's name in the list: when it is due, or when it was done. */
function listNote(plan: VanePlanDetail): string {
  if (plan.status === "done" && plan.doneAt) return `Done ${shortDate(plan.doneAt)}`;
  return plan.dueOn ? dueLabel(plan.dueOn) : "No due date";
}

/**
 * Plans (PageVanePlan): every plan Vane broke a job into, on the left with
 * how far along each is; the chosen one on the right, its steps in order,
 * whose each is and what each found. A person ticks their own steps here.
 */
export function PlansView({
  plans,
  selectedId,
  onTick,
  busy = false,
}: {
  plans: VanePlanDetail[];
  selectedId: string | null;
  /** A person ticks their own step done or not done; Vane's steps tick as its jobs finish. */
  onTick?: (planId: string, stepId: string, done: boolean) => void;
  busy?: boolean;
}) {
  if (plans.length === 0) {
    return (
      <div className="kbody vn-body">
        <Empty icon="step" title="No plans yet">
          When a job is bigger than one look, Vane breaks it into steps here, each owned by Vane or by a person. Give it one with Ctrl J.
        </Empty>
      </div>
    );
  }
  const plan = plans.find((candidate) => candidate.id === selectedId) ?? plans[0]!;
  const pill = planPill(plan);
  return (
    <div className="kbody">
      <div className="vn-plans">
        <nav className="vn-plan-list" aria-label="Plans">
          {plans.map((candidate) => (
            <Link
              key={candidate.id}
              href={`/vane/plans?plan=${candidate.id}`}
              scroll={false}
              aria-current={candidate.id === plan.id ? "true" : undefined}
              className={candidate.id === plan.id ? "vn-plan-item is-on" : "vn-plan-item"}
            >
              <span className="vn-plan-row">
                <span className="vn-plan-name">{candidate.title}</span>
                <span className="vn-plan-due">{listNote(candidate)}</span>
              </span>
              <Meter value={share(candidate)} label={`${candidate.done} of ${candidate.steps.length} steps done`} />
            </Link>
          ))}
        </nav>
        <section className="vn-plan" aria-labelledby="vn-plan-title">
          <div className="vn-plan-h">
            <h2 id="vn-plan-title">{plan.title}</h2>
            <Pill tone={pill.tone}>{pill.text}</Pill>
            <span className="vn-plan-when">
              {plan.dueOn ? `Due ${longDate(plan.dueOn)} · ` : ""}started by Vane, {when(plan.createdAt)}
            </span>
          </div>
          <Meter value={share(plan)} label={`${plan.done} of ${plan.steps.length} steps done`} />
          <div className="vn-plan-steps">
            <div className="vp">
              <ol>
                {plan.steps.map((step) => (
                  <li key={step.id} className={`is-${step.status}`}>
                    {step.owner === "person" && onTick && (plan.status === "open" || plan.status === "done") ? (
                      <button
                        type="button"
                        className="vn-tick"
                        aria-pressed={step.status === "done"}
                        aria-label={step.status === "done" ? `Mark “${step.label}” not done` : `Mark “${step.label}” done`}
                        title={step.status === "done" ? "Mark not done" : "Mark done"}
                        disabled={busy}
                        onClick={() => onTick(plan.id, step.id, step.status !== "done")}
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
                    <span className="muted">{step.owner === "vane" ? "Vane" : "You"}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
