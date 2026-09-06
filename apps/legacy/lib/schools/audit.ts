import {
  writePlatformAuditEvent,
  type AuditClient,
} from "@corelithzw/platform/audit/platform";

/**
 * The school's privileged actions, written down once.
 *
 * DoD item 7 — "every privileged action writes a `PlatformAuditEvent`" — was
 * unmet across the whole fee surface: before S-2.5/S-2.6 not one route in
 * `app/api/v2/schools/**` wrote an audit row. That pass closed it for the
 * actions that move money in or out, and named the rest — raising a bill,
 * issuing it, writing it off, granting a waiver — as equally privileged and
 * equally silent. They are covered here now: a school that cannot answer "who
 * wrote off this $400 and when" has no answer at all.
 *
 * The union exists so that a new event type is a deliberate addition rather
 * than a string typed twice slightly differently — an audit log is only
 * searchable if the verbs are finite.
 */
export type SchoolAuditEventType =
  | "schools.fee.receipt.recorded"
  | "schools.fee.receipt.voided"
  /** S-2.7 — a bursar re-sent a receipt to ZIMRA by hand. */
  | "schools.fee.receipt.fiscalised"
  | "schools.fee.credit.allocated"
  | "schools.fee.refund.requested"
  | "schools.fee.refund.paid"
  | "schools.fee.refund.cancelled"
  /**
   * S-2.8 — the rest of DoD item 7. Six bursar actions changed what a family
   * owed and said nothing about it. Each of these is written inside the
   * transaction that performs the mutation, so no row describes a bill that
   * was never raised and none is lost to a failed commit.
   */
  | "schools.fee.invoice.created"
  | "schools.fee.invoice.issued"
  /** One row for one bulk run, naming every invoice it raised. */
  | "schools.fee.invoice.bulk-generated"
  | "schools.fee.invoice.written-off"
  /**
   * Editing and discarding an invoice, which only a DRAFT one allows. Both
   * change what a family is about to be asked for, so neither may happen
   * silently — "who removed the invoice that should have been raised" is a
   * question a bursar gets asked at the end of a term.
   */
  | "schools.fee.invoice.edited"
  | "schools.fee.invoice.discarded"
  | "schools.fee.waiver.created"
  /**
   * A waiver created straight into `APPROVED` or `APPLIED` was authorised in
   * the same breath as it was written down. Approving is the privileged half —
   * a draft costs a family nothing — so it is named separately rather than
   * hidden in the created row's payload.
   */
  | "schools.fee.waiver.approved"
  | "schools.fee.waiver.applied"
  /**
   * The other three fates of a waiver, and editing or discarding a draft one.
   * Refusing and reversing both put money back on a family's bill, so they are
   * named rather than folded into an "edited" row that says a field changed.
   */
  | "schools.fee.waiver.rejected"
  | "schools.fee.waiver.reversed"
  | "schools.fee.waiver.edited"
  | "schools.fee.waiver.discarded"
  /**
   * S-4.6 — copying a fee sheet to other year groups. One act that decides what
   * every family in fifteen classes will be billed, so "who copied Form 1's fees
   * across the school, and which classes were left alone" needs an answer.
   */
  | "schools.fee.structure.cloned"
  /**
   * A structure's own lifecycle. Activating a draft is the moment a sheet of
   * amounts becomes what the school will bill, and archiving one takes it out
   * of use, so both are named separately from an ordinary edit.
   */
  | "schools.fee.structure.edited"
  | "schools.fee.structure.active"
  | "schools.fee.structure.archived"
  | "schools.fee.structure.deleted"
  /**
   * S-3.3 — a school switching systems. An import writes hundreds of students,
   * parents and balances in one act, so "who loaded these nine hundred pupils,
   * and when" needs an answer that is not "somebody, at some point". The commit
   * row names the counts; the rollback row names what was taken back out.
   */
  | "schools.import.committed"
  | "schools.import.rolled-back";

export type SchoolAuditArgs = {
  companyId: string;
  actorId: string;
  eventType: SchoolAuditEventType;
  entityType: string;
  entityId: string;
  /** Why, in the bursar's own words, where the action asks for a reason. */
  reason?: string;
  payload?: Record<string, unknown>;
};

/**
 * Write a school audit event, on the client you give it.
 *
 * Pass the transaction client. An audit row written outside the transaction
 * that performed the action can survive a rollback and describe something that
 * never happened, which is worse than no row at all; and one written after a
 * commit can be lost to a crash, leaving money moved and nothing said. Inside,
 * both fates are impossible.
 *
 * It does not swallow errors, for the same reason.
 */
export async function writeSchoolAuditEvent(
  client: AuditClient,
  args: SchoolAuditArgs,
): Promise<void> {
  await writePlatformAuditEvent(
    {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: args.eventType,
      entityType: args.entityType,
      entityId: args.entityId,
      reason: args.reason,
      payload: args.payload,
    },
    client,
  );
}
