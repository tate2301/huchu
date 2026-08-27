import type { BadgeTone } from "@corelithzw/react";

import type { CanonicalUiStatus } from "@/lib/ui/status-map";

/**
 * What colour each piece of CRM vocabulary is.
 *
 * Two rules, applied consistently, which is the whole point of gathering them
 * in one file rather than letting each screen invent its own map:
 *
 *   - A **state** is coloured. Won is green, blocked is red, awaiting a
 *     decision is amber. The colour is doing work — it is how you find the row
 *     that needs you without reading every row.
 *   - A **category** is not. "Contractor", "Site contact", "Sales rep" are
 *     facts about a record, not judgements on it, and colouring them spends
 *     the reader's attention on something that never needs acting on. Those
 *     stay neutral on purpose; the page is not monochrome by accident, it is
 *     monochrome everywhere the colour would mean nothing.
 *
 * Anything that is genuinely a state and is still rendering grey is a bug.
 */

/** How likely two records are the same. A near-certain duplicate is a problem. */
export const DUPLICATE_CONFIDENCE_TONE: Record<string, BadgeTone> = {
  HIGH: "danger",
  MEDIUM: "warn",
  LOW: "neutral",
};

/** Task priority. Normal and low are not worth a colour — that is what normal means. */
export const TASK_PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warn",
  URGENT: "danger",
};

/** A pipeline stage's terminal outcome, as configured in settings. */
export const STAGE_OUTCOME_TONE: Record<string, BadgeTone> = {
  OPEN: "neutral",
  WON: "success",
  LOST: "danger",
};

/**
 * Where a deal's stage sits, as a status the chip can colour.
 *
 * A deal's stages are configured per pipeline, so there is no fixed table to
 * look them up in — which is why the chip in the band was coloured from the
 * deal's *outcome* instead, and every open deal in a six-stage pipeline wore
 * the same hue whether it was a first phone call or a signed quote waiting on
 * a deposit. That is a state rendering as though it had none, which is the bug
 * this file's header describes.
 *
 * Position is the only thing the pipeline tells us about an open stage, and it
 * is enough: early is waiting, the middle is work in flight, and the last open
 * stage is a decision sitting with somebody else. Won and lost keep their own
 * weight.
 */
export function dealStageStatus(
  outcome: string,
  position: number,
  openStageCount: number,
): CanonicalUiStatus {
  if (outcome === "WON") return "passing";
  if (outcome === "LOST") return "failing";
  // A one- or two-stage pipeline has no middle to speak of, so the last open
  // stage is the decision and everything before it is work.
  if (openStageCount > 1 && position >= openStageCount - 1) return "in_review";
  if (position <= 0) return "pending";
  return "in_progress";
}

/**
 * The one thing to do next on a record, and the reason it is being asked for.
 *
 * Every record page had grown its own idea of what to offer: a deal chained
 * four buttons off document and visit counts, a lead offered "Add a task", and
 * a person, a company and a site offered nothing in the rail at all. The rail
 * said "Nothing scheduled — this deal will go quiet" in grey and gave the
 * reader nowhere to press. So the same judgement lives here once, and the five
 * pages differ only in which sheet they open when it is pressed.
 *
 * Two rules:
 *
 *   - The reason is derived, never written down. "This lead has been waiting
 *     eleven days" has to be true of *this* lead, or the callout is furniture.
 *   - A closed record gets nothing. There is no next step on a lost deal, and
 *     a button that reopens one by accident is worse than a blank panel.
 */
export type NextStepAction =
  /** Ring them — or record that somebody did. */
  | "call"
  /** Get somebody out to the site. */
  | "visit"
  /** Price the work and send it. */
  | "quote"
  /** The quote is out and nobody has answered it. */
  | "chase"
  /** The work is done and the money is not in. */
  | "payment"
  /** Won work that nobody has raised a job for. */
  | "job"
  /** A lead that has earned a deal. */
  | "convert"
  /** An account with nothing being sold to it. */
  | "deal"
  /** Write to them. */
  | "email";

export type NextStep = {
  action: NextStepAction;
  /** The button's own words — a verb and its object, never "Continue". */
  label: string;
  /** What happens if nobody presses it, in this record's own facts. */
  reason: string;
  /**
   * Nothing is on the calendar and the clock is running. The canvas draws this
   * case as an amber callout above the button; anything else is a plain line.
   */
  urgent: boolean;
};

export type NextStepFacts = {
  kind: "lead" | "deal" | "person" | "company" | "site";
  /** A lead's fixed stage, or a deal's stage outcome. Absent elsewhere. */
  stage?: string;
  /**
   * An account's standing — `CrmClient.accountStatus`. Companies only, and the
   * only thing that says an account is closed rather than merely quiet.
   */
  accountStatus?: string;
  /** Days since anybody last had contact. `null` when nobody ever has. */
  daysSinceContact: number | null;
  /** A task or a visit is on the calendar. */
  scheduled?: boolean;
  visitBooked?: boolean;
  visitDone?: boolean;
  quoteSent?: boolean;
  /** The customer has accepted, declined or otherwise answered the quote. */
  quoteAnswered?: boolean;
  /** Money is invoiced and not collected. */
  owed?: boolean;
  /** A lead that is already a deal — the lifecycle is over, not stalled. */
  converted?: boolean;
  /** How much business is open against an account. */
  openDeals?: number;
  /** Reach them in writing rather than by phone. */
  prefersEmail?: boolean;
};

/**
 * How long they have been left, as a clause that can end a sentence.
 *
 * Every branch of it has to be grammatical on its own, because the callout is
 * assembled rather than written: "nobody has ever been in touch" and "it has
 * been 11 days since anybody spoke to them" have to slot into the same
 * sentence, and a record nobody has ever rung is the commonest case of all.
 */
function sinceContact(days: number | null): string {
  if (days === null) return "nobody has ever been in touch";
  if (days <= 0) return "somebody was in touch today";
  if (days === 1) return "it has been a day since anybody spoke to them";
  return `it has been ${days} days since anybody spoke to them`;
}

/** The wait on its own — "11 days" — or nothing, when there has not been one. */
function waitedFor(days: number | null): string | null {
  if (days === null || days <= 0) return null;
  return days === 1 ? "a day" : `${days} days`;
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Whole days since an instant, or `null` when there is no instant. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function resolveNextStep(facts: NextStepFacts): NextStep | null {
  const idle = facts.daysSinceContact === null || facts.daysSinceContact >= 7;
  // Amber is for drift: nothing booked *and* nobody has spoken lately. A
  // record somebody rang this morning is not an emergency because the diary
  // happens to be empty.
  const urgent = !facts.scheduled && idle;
  const wait = waitedFor(facts.daysSinceContact);
  // The canvas's own sentence: nothing booked, this long waiting, and what
  // that costs. Without a wait to name it is the same sentence, minus a claim
  // we cannot support.
  const drifting = wait ? `Nothing is scheduled and this has waited ${wait}.` : "Nothing is scheduled.";

  if (facts.kind === "person") {
    return {
      action: facts.prefersEmail ? "email" : "call",
      label: facts.prefersEmail ? "Send an email" : "Log a call",
      reason: `${upperFirst(sinceContact(facts.daysSinceContact))}. A contact nobody speaks to is a contact nobody keeps.`,
      urgent,
    };
  }

  if (facts.kind === "company") {
    // A blacklisted account is one somebody decided not to trade with, and a
    // dormant one is nobody's to reopen off a rail button. Both were being
    // offered "Open a deal" — and a blacklisted account with nothing open hit
    // the `open === 0` branch below, so the loudest CTA on the page was amber
    // on the one account nobody should be selling to.
    if (facts.accountStatus === "BLACKLISTED" || facts.accountStatus === "INACTIVE") {
      return null;
    }

    const open = facts.openDeals ?? 0;
    return {
      action: "deal",
      label: "Open a deal",
      reason:
        open > 0
          ? `${open} deal${open === 1 ? "" : "s"} open against this account, and ${sinceContact(facts.daysSinceContact)}.`
          : `Nothing is being sold to this account, and ${sinceContact(facts.daysSinceContact)}.`,
      urgent: open === 0 && urgent,
    };
  }

  if (facts.kind === "site") {
    return {
      action: "visit",
      label: "Book a visit",
      reason: facts.visitBooked
        ? "A visit is booked. Book another if the work needs a second look."
        : facts.visitDone
          ? "Nobody is due back here. The measurements on file are as old as the last visit."
          : "Nobody has been out here yet, so there are no measurements to quote from.",
      urgent: !facts.visitBooked && !facts.visitDone,
    };
  }

  // Leads and deals share a ladder — call, visit, quote, chase, bill, raise the
  // job — because it is the same sale either side of conversion. What differs
  // is the ending: a lead becomes a deal, a deal becomes work.
  const stage = facts.stage ?? "";
  if (stage === "LOST") return null;

  if (facts.kind === "lead") {
    if (facts.converted) return null;
    if (stage === "WON" || stage === "INVOICED") {
      return {
        action: "convert",
        label: "Convert to deal",
        reason:
          "This lead has been sold but never converted, so the work is not in anybody's pipeline.",
        urgent: true,
      };
    }
  }

  if (facts.kind === "deal" && stage === "WON") {
    return {
      action: "job",
      label: "Raise the job",
      reason: "This is won. Nothing gets fitted until somebody raises the job for it.",
      urgent: true,
    };
  }

  if (facts.quoteSent && !facts.quoteAnswered) {
    return {
      action: "chase",
      label: "Chase the quote",
      reason: wait
        ? `The quote is out and nobody has answered it. It has been ${wait} since anybody chased it.`
        : "The quote is out and nobody has answered it yet.",
      urgent,
    };
  }

  if (facts.owed) {
    return {
      action: "payment",
      label: "Record the payment",
      reason: "There is money invoiced and not collected against this.",
      urgent: false,
    };
  }

  if (facts.visitDone && !facts.quoteSent) {
    return {
      action: "quote",
      label: "Send the quote",
      reason:
        "The site has been measured and nothing has been priced. Measurements go stale faster than the customer's patience.",
      urgent,
    };
  }

  // Qualified means somebody has decided this is real work. The next thing
  // real work needs is eyes on the site — but only once somebody has actually
  // spoken to them: a deal opened this morning with nobody on the other end of
  // it wants a phone call, not a van.
  const spokenTo = facts.daysSinceContact !== null;
  if (
    spokenTo &&
    !facts.visitBooked &&
    !facts.visitDone &&
    stage !== "NEW" &&
    stage !== "CONTACTED"
  ) {
    return {
      action: "visit",
      label: "Book the site visit",
      reason: facts.scheduled
        ? "Nobody is going out to look at the work yet, so there is nothing to quote from."
        : `${drifting} There is nothing to quote from until somebody has been out.`,
      urgent,
    };
  }

  return {
    action: "call",
    label: "Book the call",
    reason: facts.scheduled
      ? `${upperFirst(sinceContact(facts.daysSinceContact))}.`
      : `${drifting} It will go quiet without a call.`,
    urgent,
  };
}

/**
 * Where a job has got to. Canonical UI statuses rather than badge tones,
 * because these render through `StatusChip`.
 */
export const WORK_ORDER_STATUS: Record<string, CanonicalUiStatus> = {
  DRAFT: "inactive",
  SCHEDULED: "pending",
  IN_PROGRESS: "in_progress",
  BLOCKED: "failing",
  COMPLETED: "passing",
  CANCELLED: "inactive",
};

/** A quote, invoice or receipt's standing. */
export const DOCUMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  ISSUED: { label: "Issued", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  PAID: { label: "Paid", tone: "success" },
  RECEIVED: { label: "Received", tone: "success" },
  EXPIRED: { label: "Expired", tone: "warn" },
  VOIDED: { label: "Voided", tone: "neutral" },
  MISSING: { label: "No paperwork", tone: "danger" },
};

/** A site visit's standing. */
export const VISIT_STATUS: Record<string, CanonicalUiStatus> = {
  SCHEDULED: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "passing",
  CANCELLED: "inactive",
  NO_SHOW: "failing",
};

/**
 * The dot beside a stage in a picker, on a board column, anywhere the stage
 * is named. A hue per stage rather than per outcome: in a list of six stages
 * the reader is telling them apart, not judging them, and six shades of the
 * same amber does that worse than six distinct hues.
 *
 * Deliberately the ramp tokens rather than the semantic ones, except at the
 * two ends where won and lost genuinely are success and failure.
 */
export const LEAD_STAGE_DOT: Record<string, string> = {
  NEW: "bg-[var(--tone-info)]",
  CONTACTED: "bg-[var(--accent-500)]",
  QUALIFIED: "bg-[var(--brand)]",
  SITE_VISIT: "bg-[var(--warning-400)]",
  QUOTED: "bg-[var(--tone-warn)]",
  INVOICED: "bg-[var(--warning-600)]",
  WON: "bg-[var(--tone-success)]",
  LOST: "bg-[var(--tone-danger)]",
};

/** A configurable pipeline stage's dot, keyed by its terminal outcome. */
export const DEAL_STAGE_DOT: Record<string, string> = {
  OPEN: "bg-[var(--brand)]",
  WON: "bg-[var(--tone-success)]",
  LOST: "bg-[var(--tone-danger)]",
};

/**
 * A stage's colour, resolved from the token stored on the pipeline stage.
 *
 * Two classes per colour rather than one: a dot for the header and a band for
 * the rule that runs along the top of the column. The band is what makes the
 * colour readable down a board — a dot alone is four pixels the eye has to
 * find twice, once per column.
 *
 * Unknown tokens fall back to the brand rather than to nothing, so a stage
 * somebody coloured with a token we have since renamed still reads as a stage.
 */
export const STAGE_COLOR: Record<string, { dot: string; band: string }> = {
  "status-info-border": { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  "status-success-border": { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  "status-warning-border": { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  "status-error-border": { dot: "bg-[var(--tone-danger)]", band: "bg-[var(--tone-danger)]" },
  brand: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  accent: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
};

export function stageColor(token: string | null | undefined) {
  return (token && STAGE_COLOR[token]) || STAGE_COLOR.brand;
}

/** The fixed lead stages, in the same two-class shape as `stageColor`. */
export const LEAD_STAGE_COLOR: Record<string, { dot: string; band: string }> = {
  NEW: { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  CONTACTED: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
  QUALIFIED: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  SITE_VISIT: { dot: "bg-[var(--warning-400)]", band: "bg-[var(--warning-400)]" },
  QUOTED: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  INVOICED: { dot: "bg-[var(--warning-600)]", band: "bg-[var(--warning-600)]" },
  WON: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  LOST: { dot: "bg-[var(--tone-danger)]", band: "bg-[var(--tone-danger)]" },
};

/**
 * Contact types, for the people board. A hue each so the columns are told
 * apart at a glance; no judgement in any of them, because a site contact is
 * not better or worse than a finance contact.
 */
export const CONTACT_TYPE_COLOR: Record<string, { dot: string; band: string }> = {
  CUSTOMER: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  DECISION_MAKER: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
  SITE_CONTACT: { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  FINANCE_CONTACT: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  SUPPLIER_CONTACT: { dot: "bg-[var(--warning-600)]", band: "bg-[var(--warning-600)]" },
  REFERRAL_PARTNER: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  OTHER: { dot: "bg-[var(--text-subtle)]", band: "bg-[var(--text-subtle)]" },
};

/**
 * Lead channels, for the setup page's channel cards and its source rows.
 *
 * A hue each and no judgement in any of them: a walk-in is not worth less than
 * a paid click, and colouring them as though it were would put a verdict on a
 * page whose only job is to say where enquiries came from. `OTHER` is
 * deliberately the subtle ink — it is the absence of an answer, not an answer.
 */
export const CRM_CHANNEL_COLOR: Record<string, { dot: string; band: string }> = {
  MANUAL: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  WEB_FORM: { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  WEBHOOK: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
  SOCIAL: { dot: "bg-[var(--warning-400)]", band: "bg-[var(--warning-400)]" },
  ADS: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  REFERRAL: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  OTHER: { dot: "bg-[var(--text-subtle)]", band: "bg-[var(--text-subtle)]" },
};

/** Company account standing. Here the colour *is* a judgement, so it is semantic. */
export const ACCOUNT_STATUS_COLOR: Record<string, { dot: string; band: string }> = {
  ACTIVE: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  ON_HOLD: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  INACTIVE: { dot: "bg-[var(--text-subtle)]", band: "bg-[var(--text-subtle)]" },
  BLACKLISTED: { dot: "bg-[var(--tone-danger)]", band: "bg-[var(--tone-danger)]" },
};
