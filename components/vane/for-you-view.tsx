"use client";

import * as React from "react";

import { Button, ButtonLink, Empty, Finding, GroupHead, Icon, type IconName } from "@/components/core";
import type { VaneCard, VanePanel } from "@/lib/vane/panel";

import { NotNowMenu } from "./not-now-menu";
import { readSummary } from "./vane-card-drawer";
import { VanePlanCardView } from "./vane-plan-card";
import { VaneStateNote } from "./vane-state-note";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

/** The mark beside a card: the module it came from (`moduleName`). */
const SOURCE_ICONS: Record<string, IconName> = {
  Books: "books",
  CRM: "pipeline",
  Tender: "store",
  Reports: "reports",
  People: "person",
  Payroll: "money",
  Schools: "users",
  Gold: "grade",
  // A workspace's own names for its CRM and shop.
  Pipeline: "pipeline",
  "Site visits": "visits",
  Showroom: "showroom",
};

const ACTION_ICONS: Record<string, IconName> = { send: "send", review: "eye", open: "chev" };

/** "Books, CRM and Tender". */
function listOf(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The finding the page opens with: what waits and what Vane is on, then where it came from. */
function finding(cards: VaneCard[], working: number, lastWorkedAt: string | null) {
  if (cards.length === 0) {
    return {
      fact: working > 0 ? `Nothing waits for you. Vane is working on ${working}.` : "Nothing waits for you.",
      rest: lastWorkedAt ? `Vane is up to date. It last checked at ${time(lastWorkedAt)}.` : "Vane puts what needs you here.",
    };
  }
  const things = `${cards.length} ${cards.length === 1 ? "thing" : "things"}`;
  return {
    fact: working > 0 ? `Vane has ${things} for you and is working on ${working}.` : `Vane has ${things} for you.`,
    rest: `${cards.length === 1 ? "It came" : "They came"} from ${listOf([...new Set(cards.map((card) => card.source))])}.`,
  };
}

/**
 * For you (`/vane`, the VaneForYou board): the finding, every card Vane has
 * for this person across the workspace, and beside them what Vane is working
 * on, the plan it has broken down and what it did today. The first card's
 * act is the page's primary, on S.
 *
 * Pure: the page feeds it, and the fixture route feeds it the drawn data.
 */
export function ForYouView({
  panel,
  from,
  canResume,
  onResume,
  resuming = false,
  onAct,
  onRead,
  onMute,
}: {
  panel: VanePanel;
  /** A watched module chosen in the panel: only its cards. */
  from?: { key: string; name: string } | null;
  canResume: boolean;
  onResume?: () => void;
  resuming?: boolean;
  onAct: (card: VaneCard, target?: string) => void;
  /** What I read: opens the card beside the list. */
  onRead: (card: VaneCard) => void;
  /** Not now, with the reason chosen. */
  onMute: (card: VaneCard, reason: string) => void;
}) {
  const { status, plans, done, working } = panel;
  const cards = from ? panel.items.filter((card) => card.source === from.name) : panel.items;
  const lede = finding(cards, status.counts.working, status.lastWorkedAt);

  return (
    <div className="vh">
      <div className="vh-main">
        <VaneStateNote status={status} canResume={canResume} onResume={onResume} resuming={resuming} />
        <Finding fact={lede.fact} rest={lede.rest} />
        <section aria-labelledby="vane-for-you">
          <GroupHead id="vane-for-you" title={from ? `For you, from ${from.name}` : "For you"} sum={cards.length} />
          {cards.length === 0 ? (
            <Empty
              icon="foryou"
              title="Nothing for you"
              action={
                from ? (
                  <ButtonLink href="/vane" icon="foryou">
                    Every module
                  </ButtonLink>
                ) : undefined
              }
            >
              {from
                ? `Vane has nothing from ${from.name} for you just now.`
                : status.lastWorkedAt
                  ? `Vane is up to date. It last checked at ${time(status.lastWorkedAt)}.`
                  : "When Vane finds something that needs you, it puts it here."}
            </Empty>
          ) : (
            <div className="list">
              {cards.map((card, index) => (
                <div key={card.id} className={card.kind === "issue" ? "row fy is-issue" : "row fy"}>
                  <span className="nt">
                    <Icon name={SOURCE_ICONS[card.source] ?? "foryou"} />
                  </span>
                  <div className="t">
                    <span className="k">
                      {card.kind === "issue" ? "Issue" : "Suggestion"}, {card.source} · {time(card.createdAt)}
                    </span>
                    <span className="lead" id={`vane-card-${card.id}`}>
                      {card.headline}
                    </span>
                    <span className="d">{card.body}</span>
                    <div className="a">
                      {card.action ? (
                        <Button
                          variant={index === 0 ? "primary" : "default"}
                          icon={ACTION_ICONS[card.action.type] ?? "chev"}
                          shortcut={index === 0 ? (card.action.shortcut ?? "S") : undefined}
                          onClick={() => onAct(card)}
                        >
                          {card.action.label}
                        </Button>
                      ) : null}
                      {card.action?.also ? (
                        <Button
                          variant={index === 0 ? "default" : "quiet"}
                          icon="eye"
                          onClick={() => onAct(card, card.action?.also?.target)}
                        >
                          {card.action.also.label}
                        </Button>
                      ) : null}
                      <Button variant="quiet" icon="table" title={readSummary(card) || undefined} onClick={() => onRead(card)}>
                        What I read
                      </Button>
                    </div>
                  </div>
                  <NotNowMenu describedBy={`vane-card-${card.id}`} onMute={(reason) => onMute(card, reason)} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <aside className="ask vh-side" aria-label="What Vane is doing">
        <div className="ask-b">
          <div className="vs" style={{ marginTop: 0 }}>
            Working on <span className="pn-n">{status.counts.working}</span>
          </div>
          {working.length === 0 ? <p className="muted">Nothing right now.</p> : null}
          {working.map((job) => (
            <div key={job.id} className="vn-now">
              {job.running ? <span className="live-d" aria-hidden="true" /> : <span aria-hidden="true" />}
              <span className="truncate">{job.label}</span>
              <span className="muted">{job.progress ?? (job.running ? "" : "Next")}</span>
            </div>
          ))}

          {plans.length > 0 ? <div className="vs">Broken down</div> : null}
          {plans.slice(0, 1).map((plan) => (
            <VanePlanCardView key={plan.id} plan={plan} />
          ))}

          <div className="vs">
            Done today <span className="pn-n">{status.counts.doneToday}</span>
          </div>
          {done.length === 0 ? <p className="muted">Nothing yet today.</p> : null}
          {done.map((entry) => (
            <div key={entry.id} className="vd">
              <Icon name="done" />
              <span className="truncate">{entry.text}</span>
              <span className="muted">{time(entry.at)}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
