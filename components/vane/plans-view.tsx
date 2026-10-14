"use client";

import * as React from "react";
import Link from "next/link";

import { Button, Empty, Icon, Meter } from "@/components/core";
import type { VanePlanRow, VanePlanStepRow } from "@/lib/vane/lists";

const shortDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const longDay = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long" });
const when = (iso: string) => {
  const date = new Date(iso);
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
};

const share = (plan: VanePlanRow) => (plan.steps.length ? (plan.done / plan.steps.length) * 100 : 0);

/** "Due 25 Oct", "Done 9 Oct", "Due 3 Nov · waiting for Start". */
function planWhen(plan: VanePlanRow): string | null {
  if (plan.status === "done" && plan.doneAt) return `Done ${shortDay(plan.doneAt.slice(0, 10))}`;
  const due = plan.dueOn ? `Due ${shortDay(plan.dueOn)}` : null;
  if (plan.status === "waiting") return due ? `${due} · waiting for Start` : "Waiting for Start";
  return due;
}

/** Where a plan stands: "Vane is on step 2", "Step 3 waits for you", "Waiting for Start". */
function standing(plan: VanePlanRow): string {
  if (plan.status === "done") return "Done";
  if (plan.status === "waiting") return "Waiting for Start";
  const now = plan.steps.find((step) => step.status === "now");
  if (now) return now.owner === "vane" ? `Vane is on step ${now.position}` : `Step ${now.position} waits for you`;
  const next = plan.steps.find((step) => step.status !== "done");
  return next ? (next.owner === "vane" ? `Vane does step ${next.position} next` : `Step ${next.position} waits for you`) : "Every step is done";
}

function Step({
  step,
  ticking,
  onTick,
}: {
  step: VanePlanStepRow;
  /** Nothing can be ticked now: a tick is on its way, or the plan waits for Start. */
  ticking: boolean;
  onTick: (step: VanePlanStepRow, done: boolean) => void;
}) {
  const icon = <Icon name={`step-${step.status}`} />;
  return (
    <li className={`is-${step.status}`}>
      {step.owner === "person" ? (
        // A person's own step: they tick it here once it is done.
        <button
          type="button"
          className="btn btn-quiet btn-icon"
          style={{ width: 16, height: 16, minHeight: 0, padding: 0 }}
          aria-pressed={step.status === "done"}
          aria-label={step.status === "done" ? `Not done yet: ${step.label}` : `Mark done: ${step.label}`}
          disabled={ticking}
          onClick={() => onTick(step, step.status !== "done")}
        >
          {icon}
        </button>
      ) : (
        icon
      )}
      <span>
        {step.label}
        {step.progress ? (
          <>
            <br />
            <span className="muted" style={{ fontSize: "var(--text-12)" }}>
              {step.progress}
            </span>
          </>
        ) : null}
      </span>
      <span className="muted">{step.owner === "vane" ? "Vane" : "You"}</span>
    </li>
  );
}

/**
 * Plans (`/vane/plans`, the PageVanePlan board): each plan with its meter on
 * the left, and the chosen plan on the right, its steps in order, who owns
 * each and how far along it is. A plan Vane lays out waits for Start
 * (Ctrl ↵): nothing in it runs or ticks before then. Started, Vane's steps
 * run one at a time and tick as their jobs finish; a person ticks their own.
 * On a phone the list and the plan are separate pages.
 *
 * Pure: the page feeds it.
 */
export function PlansView({
  plans,
  chosenId,
  showList,
  ticking,
  onTick,
  starting = false,
  onStart,
}: {
  plans: VanePlanRow[];
  chosenId: string | null;
  /** On a phone, the list (`/vane/plans`) or the plan (`/vane/plans/<id>`). */
  showList: boolean;
  ticking: boolean;
  onTick: (plan: VanePlanRow, step: VanePlanStepRow, done: boolean) => void;
  starting?: boolean;
  /** Start: a waiting plan begins. */
  onStart?: (plan: VanePlanRow) => void;
}) {
  if (plans.length === 0) {
    return (
      <Empty icon="list" title="No plans yet">
        When a job is bigger than one card (VAT, the close, a pay run), Vane breaks it into steps and shows here which are its
        own and which wait for you.
      </Empty>
    );
  }
  const chosen = plans.find((plan) => plan.id === chosenId) ?? plans[0];

  return (
    <div style={{ flex: "1 1 auto", display: "flex", minHeight: 0 }}>
      <nav
        aria-label="Plans"
        className={showList ? "max-[719px]:!w-full max-[719px]:!border-r-0" : "max-[719px]:hidden"}
        style={{ flex: "none", width: 340, borderRight: "1px solid var(--color-line)" }}
      >
        {plans.map((plan) => {
          const on = plan.id === chosen.id;
          return (
            <Link
              key={plan.id}
              href={`/vane/plans/${plan.id}`}
              aria-current={on ? "page" : undefined}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "14px var(--space-24)",
                borderBottom: "1px solid var(--color-line)",
                background: on ? "var(--color-accent-tint)" : "var(--color-surface)",
                boxShadow: on ? "inset 3px 0 0 var(--color-accent)" : "none",
                color: "var(--color-ink)",
                textDecoration: "none",
              }}
            >
              <span style={{ display: "flex", gap: "var(--space-8)" }}>
                <span className="truncate" style={{ fontWeight: 600 }}>
                  {plan.title}
                </span>
                {planWhen(plan) ? (
                  <span style={{ marginLeft: "auto", flex: "none", fontSize: "var(--text-12)", color: "var(--color-muted)" }}>
                    {planWhen(plan)}
                  </span>
                ) : null}
              </span>
              <Meter accent value={share(plan)} label={`${plan.title}: ${plan.done} of ${plan.steps.length} steps done`} />
            </Link>
          );
        })}
      </nav>

      <article
        aria-labelledby="vane-plan-title"
        className={showList ? "max-[719px]:hidden" : undefined}
        style={{ flex: "1 1 0", minWidth: 0 }}
      >
        <div style={{ padding: "var(--space-24) 28px", display: "flex", flexDirection: "column", gap: "var(--space-16)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 10 }}>
            <h2 id="vane-plan-title" style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>
              {chosen.title}
            </h2>
            <span className={chosen.status === "done" ? "pill" : "pill pill-info"}>{standing(chosen)}</span>
            <span style={{ marginLeft: "auto", color: "var(--color-muted)" }}>
              {[
                chosen.dueOn ? `Due ${longDay(chosen.dueOn)}` : null,
                `${chosen.status === "waiting" ? "laid out by Vane" : "started"} ${when(chosen.createdAt)}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {chosen.status === "waiting" ? (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-12)" }}>
              <span style={{ flex: "1 1 240px", color: "var(--color-ink-2)" }}>
                {chosen.canStart
                  ? "Nothing in it runs until you press Start. Then Vane takes its steps one at a time, and yours wait for you."
                  : `It waits for ${chosen.whose ?? "the person who asked for it"} to press Start.`}
              </span>
              {chosen.canStart && onStart ? (
                <Button variant="primary" icon="run" shortcut="Ctrl ↵" busy={starting} onClick={() => onStart(chosen)}>
                  Start
                </Button>
              ) : null}
            </div>
          ) : null}
          <Meter accent value={share(chosen)} label={`${chosen.done} of ${chosen.steps.length} steps done`} />
          <div style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="vp" style={{ boxShadow: "none", padding: 0 }}>
              <ol>
                {chosen.steps.map((step) => (
                  <Step
                    key={step.id}
                    step={step}
                    ticking={ticking || chosen.status === "waiting"}
                    onTick={(row, done) => onTick(chosen, row, done)}
                  />
                ))}
              </ol>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
