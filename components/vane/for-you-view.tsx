"use client";

import * as React from "react";

import { Button, Empty, Finding, GroupHead, Icon, Meter } from "@/components/core";
import type { VaneForYou, VaneForYouCard } from "@/lib/vane/pages";

import { clock, dueLabel, listOf, plural, when } from "./format";
import { NotNow } from "./not-now";
import { VaneStateNotice } from "./vane-state";

/** The kind and source over a card's headline: "Issue, Books · 06:04". */
export function cardKicker(card: Pick<VaneForYouCard, "kind" | "source" | "createdAt">): string {
  return `${card.kind === "issue" ? "Issue" : "Suggestion"}, ${card.source} · ${when(card.createdAt)}`;
}

/** The finding over For you: how many things, how many jobs, and where they came from. */
export function forYouFinding(data: Pick<VaneForYou, "items" | "working" | "sources">, moduleLabel: string | null): { fact: string; rest: string | null } {
  const things = data.items.length;
  const jobs = data.working.length;
  const from = moduleLabel ? ` from ${moduleLabel}` : "";
  const fact =
    things === 0
      ? `Nothing${from} waits for you${jobs ? `, and Vane is working on ${jobs}.` : "."}`
      : `Vane has ${plural(things, "thing")} for you${from}${jobs ? ` and is working on ${jobs}` : ""}.`;
  const sources = moduleLabel ? [] : data.sources;
  const rest =
    things === 0
      ? "It puts what needs you here, with the question behind each card."
      : sources.length > 1
        ? `They came from ${listOf(sources)}.`
        : sources.length === 1
          ? `They all came from ${sources[0]}.`
          : null;
  return { fact, rest };
}

/**
 * For you (VaneForYou): every card Vane has for this person across the
 * modules, each with its button, What I read and Not now; beside it, what
 * Vane is working on, the plan it broke down and what it did today, under
 * the state it is in. Pure: the page feeds it.
 */
export function ForYouView({
  data,
  moduleLabel,
  canPause,
  onResume,
  resuming,
  onAct,
  onRead,
  onNotNow,
  muting,
}: {
  data: VaneForYou;
  /** The module the cards are narrowed to, from Watching. */
  moduleLabel: string | null;
  canPause: boolean;
  onResume: () => void;
  resuming: boolean;
  onAct: (card: VaneForYouCard, target?: string) => void;
  onRead: (card: VaneForYouCard) => void;
  onNotNow: (card: VaneForYouCard, reason: string) => void;
  muting: string | null;
}) {
  const finding = forYouFinding(data, moduleLabel);
  // The first card with a button is the one S presses.
  const first = data.items.find((card) => card.action)?.id ?? null;
  return (
    <div className="vh">
      <div className="vh-main">
        <Finding fact={finding.fact} rest={finding.rest} />
        <section aria-labelledby="vn-for-you">
          <GroupHead id="vn-for-you" title="For you" sum={data.items.length} />
          {data.items.length === 0 ? (
            <Empty icon="foryou" title={moduleLabel ? `Nothing from ${moduleLabel} waits for you` : "Nothing waits for you"}>
              When Vane finds something you can act on, it puts it here with the question behind it. Give it a job with Ctrl J.
            </Empty>
          ) : (
            <div className="list">
              {data.items.map((card) => (
                <ForYouRow
                  key={card.id}
                  card={card}
                  primary={card.id === first}
                  onAct={onAct}
                  onRead={onRead}
                  onNotNow={onNotNow}
                  muting={muting === card.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      <aside className="ask vh-side" aria-label="What Vane is doing">
        <div className="ask-b">
          {data.state ? <VaneStateNotice state={data.state} canPause={canPause} onResume={onResume} resuming={resuming} /> : null}
          <div className="vs" id="vn-working" style={data.state ? undefined : { marginTop: 0 }}>
            Working on <span className="pn-n">{data.working.length}</span>
          </div>
          {data.working.length === 0 ? (
            <p className="vn-quiet">Nothing is running. Give Vane a job with Ctrl J.</p>
          ) : (
            data.working.map((job) => (
              <div key={job.id} className="vn-now">
                {job.status === "running" ? <span className="live-d" aria-hidden="true" /> : <span aria-hidden="true" />}
                <span className="truncate">{job.label}</span>
                <span className="muted">{job.progress ?? (job.status === "waiting" ? "Waiting" : job.status === "queued" ? "Queued" : "")}</span>
              </div>
            ))
          )}
          {data.plan ? (
            <>
              <div className="vs">Broken down</div>
              <article className="vp">
                <div className="vp-h">
                  <h3>{data.plan.title}</h3>
                  {data.plan.dueOn ? <span className="muted">{dueLabel(data.plan.dueOn)}</span> : null}
                </div>
                <Meter
                  value={data.plan.steps.length ? (data.plan.done / data.plan.steps.length) * 100 : 0}
                  label={`${data.plan.done} of ${data.plan.steps.length} steps done`}
                />
                <ol>
                  {data.plan.steps.map((step) => (
                    <li key={step.id} className={`is-${step.status}`}>
                      <Icon name={`step-${step.status}`} />
                      <span>{step.label}</span>
                      <span className="muted">
                        {step.owner === "vane" ? "Vane" : "You"}
                        {step.progress ? `, ${step.progress}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            </>
          ) : null}
          <div className="vs">
            Done today <span className="pn-n">{data.counts.doneToday}</span>
          </div>
          {data.doneToday.length === 0 ? (
            <p className="vn-quiet">Nothing finished yet today.</p>
          ) : (
            data.doneToday.map((entry) => (
              <div key={entry.id} className="vd">
                <Icon name="done" />
                <span className="truncate">{entry.text}</span>
                <span className="muted">{clock(entry.at)}</span>
              </div>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function ForYouRow({
  card,
  primary,
  onAct,
  onRead,
  onNotNow,
  muting,
}: {
  card: VaneForYouCard;
  primary: boolean;
  onAct: (card: VaneForYouCard, target?: string) => void;
  onRead: (card: VaneForYouCard) => void;
  onNotNow: (card: VaneForYouCard, reason: string) => void;
  muting: boolean;
}) {
  const action = card.action;
  return (
    <div className={card.kind === "issue" ? "row fy is-issue" : "row fy"}>
      <span className="nt">
        <Icon name={card.kind === "issue" ? "issue" : "suggestion"} size={20} />
      </span>
      <div className="t">
        <span className="k">{cardKicker(card)}</span>
        <span className="lead">{card.headline}</span>
        <span className="d">{card.body}</span>
        <div className="a">
          {action ? (
            <Button
              variant={primary ? "primary" : "default"}
              icon={action.type === "send" ? "send" : action.type === "review" ? "eye" : "chev"}
              shortcut={primary ? "S" : undefined}
              onClick={() => onAct(card)}
            >
              {action.label}
            </Button>
          ) : null}
          {action?.also ? (
            <Button icon="eye" onClick={() => onAct(card, action.also?.target)}>
              {action.also.label}
            </Button>
          ) : null}
          <Button variant="quiet" icon="sql" title="The tables it read and the question it ran" onClick={() => onRead(card)}>
            What I read
          </Button>
        </div>
      </div>
      <NotNow busy={muting} onPick={(reason) => onNotNow(card, reason)} />
    </div>
  );
}
