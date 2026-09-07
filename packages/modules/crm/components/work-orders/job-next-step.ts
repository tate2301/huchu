import type { NextStep } from "../../tones";

import { jobWindow, type JobRecord } from "./job-types";

/**
 * The moves the page can perform.
 *
 * `block` is in the set and is never a next step: nobody's plan for a job is
 * to get stuck. It is reached from the stage rail, which is where a move you
 * make because the world went wrong belongs. Cancelling is not here at all —
 * it is in the actions menu, because writing a job off is not a step along the
 * path.
 */
export type JobAct = "schedule" | "start" | "block" | "complete" | "invoice";

export type JobNextStep = {
  step: NextStep;
  act: JobAct;
  /** The move cannot be made yet — an unbillable job, say. */
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * The one obvious thing to do to this job next.
 *
 * Same judgement `resolveNextStep` makes for a lead or a deal, and the same
 * shape, so the rail can draw it with `NextStepCard` rather than growing a
 * second amber-callout-and-a-button of its own. It is not folded into
 * `resolveNextStep` itself because that function answers from a sales record's
 * facts — days since contact, whether a quote is out — and a job's answer
 * comes entirely from its state machine, which the server has already decided.
 *
 * Two rules, the same two: the reason is derived from this job's own facts, and
 * a finished job gets nothing. A cancelled job has no next step, and a billed
 * one has a link instead of a button.
 */
export function jobNextStep(job: JobRecord): JobNextStep | null {
  const when = jobWindow(job.scheduledStart, job.scheduledEnd);

  switch (job.status) {
    case "DRAFT":
      return {
        act: "schedule",
        step: {
          // The verb vocabulary is the sales ladder's, so booking a slot
          // borrows the visit's mark — which is the right one anyway: this is
          // somebody being sent somewhere at a time.
          action: "visit",
          label: "Book the job in",
          reason: "Nothing is booked, so nobody is going. A job with no slot is still a plan.",
          urgent: true,
        },
      };

    case "SCHEDULED":
      return {
        act: "start",
        step: {
          action: "job",
          label: "Start the job",
          reason: job.isOverdue
            ? `This should have started ${when ?? "already"} and nobody has said they are on site.`
            : `Booked for ${when ?? "a slot with no time on it"}. Mark it started when the crew arrives.`,
          urgent: job.isOverdue,
        },
      };

    case "BLOCKED":
      return {
        act: "schedule",
        step: {
          action: "visit",
          label: "Book it back in",
          reason: job.blockedReason
            ? `Stuck: ${job.blockedReason}`
            : "This is stopped and nobody wrote down why.",
          urgent: true,
        },
      };

    case "IN_PROGRESS":
      return {
        act: "complete",
        step: {
          action: "convert",
          label: "Sign off and complete",
          reason:
            job.completionBlockers.length > 0
              ? `${job.completionBlockers.join(", ")}.`
              : "Everything on the checklist is done. Get the customer's name against it.",
          urgent: false,
        },
      };

    case "COMPLETED": {
      // Billed already: the rail carries the document instead of a button.
      if (job.invoice) return null;
      const blocked = job.invoiceBlockers.length > 0;
      return {
        act: "invoice",
        step: {
          action: "payment",
          label: "Raise the invoice",
          reason: blocked
            ? `${job.invoiceBlockers.join(". ")}.`
            : "Signed off and not billed. Nothing reaches the ledger until somebody asks for it.",
          // Work finished and unbilled is money sitting still, which is the
          // definition of the amber case.
          urgent: !blocked,
        },
        disabled: blocked,
        disabledReason: job.invoiceBlockers.join(". "),
      };
    }

    default:
      return null;
  }
}
