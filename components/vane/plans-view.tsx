"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Empty, Meter, Pill } from "@/components/core";
import type { VanePlanDetail } from "@/lib/vane/pages";

import { dueLabel, longDate, shortDate, when } from "./format";
import { PlanFacts, PlanSteps } from "./plan-parts";

/** The pill beside a plan's title: whose step is next, or that it is done. */
export function planPill(plan: Pick<VanePlanDetail, "status" | "current" | "person">): { text: string; tone: "info" | "ok" | "plain" } {
  if (plan.status === "waiting") return { text: "Waiting for Start", tone: "plain" };
  if (plan.status === "done") return { text: "Done", tone: "ok" };
  if (plan.status === "cancelled") return { text: "Stopped", tone: "plain" };
  if (!plan.current) return { text: "Every step done", tone: "ok" };
  if (plan.current.owner === "vane") return { text: `Vane is on step ${plan.current.position}`, tone: "info" };
  return plan.person.you
    ? { text: `Your turn, step ${plan.current.position}`, tone: "info" }
    : { text: `${plan.person.name ?? "A person"}’s turn, step ${plan.current.position}`, tone: "info" };
}

const share = (plan: VanePlanDetail) => (plan.steps.length ? (plan.done / plan.steps.length) * 100 : 0);

/** The note under a plan's name in the list: when it is due, or when it was done. */
function listNote(plan: VanePlanDetail): string {
  if (plan.status === "done" && plan.doneAt) return `Done ${shortDate(plan.doneAt)}`;
  const due = plan.dueOn ? dueLabel(plan.dueOn) : "No due date";
  return plan.status === "waiting" ? `${due} · waiting for Start` : due;
}

/**
 * Plans (PageVanePlan): every plan Vane broke a job into, on the left with
 * how far along each is; the chosen one on the right, its steps in order,
 * whose each is and what each found, then what it reads and may write. A
 * person ticks their own steps here, and presses Start on a plan that waits.
 */
export function PlansView({
  plans,
  selectedId,
  onTick,
  onStart,
  busy = false,
}: {
  plans: VanePlanDetail[];
  selectedId: string | null;
  /** A person ticks their own step done or not done; Vane's steps tick as its jobs finish. */
  onTick?: (planId: string, stepId: string, done: boolean) => void;
  /** Start: a waiting plan begins. */
  onStart?: (planId: string) => void;
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
              {plan.dueOn ? `Due ${longDate(plan.dueOn)} · ` : ""}
              {plan.status === "waiting" ? "laid out" : "started"} by Vane, {when(plan.createdAt)}
            </span>
          </div>
          <Meter value={share(plan)} label={`${plan.done} of ${plan.steps.length} steps done`} />
          {plan.job ? <p className="vn-plan-ask">{plan.job.request}</p> : null}
          <div className="vn-plan-steps">
            <PlanSteps plan={plan} onTick={onTick} busy={busy} />
          </div>
          <PlanFacts plan={plan} />
          {plan.status === "waiting" ? (
            <div className="vn-plan-start">
              <span className="vn-note">
                {plan.person.you
                  ? "Nothing starts until you press Start."
                  : `Nothing starts until ${plan.person.name ?? "the person who asked"} presses Start.`}
              </span>
              {plan.person.you && onStart ? (
                <Button variant="primary" shortcut="Ctrl ↵" busy={busy} onClick={() => onStart(plan.id)}>
                  Start
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
