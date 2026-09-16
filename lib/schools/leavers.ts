import { Prisma, type SchoolLeaverClearanceKind, type SchoolLeavingReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";

/**
 * Leavers and alumni — S-13.4 and S-13.5.
 *
 * `applyYearRollUp` already graduates a pupil. Until now graduating led
 * nowhere: the status changed and nothing asked whether the books were back,
 * the fees were settled, the bed was free or the portal account was closed.
 *
 * ## A leaver is a row
 *
 * `leavers.md` puts the decision first and it is worth restating: each of the
 * five clearance marks **can** be derived from fees, the library, boarding, the
 * portal and results — but derived means the queue is a five-way join
 * recomputed on every read, and a mark somebody deliberately overrode (a book
 * written off, a fee waived by the head) has nowhere to live. So the state is
 * stored, the derivation proposes it, and the derivation does not get the last
 * word.
 *
 * `lastDay` is the child's last day. It is **not** `SchoolEnrollment.endedAt`,
 * which `applyYearRollUp` sets to the day the office pressed the button.
 */

export class LeaverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaverError";
  }
}

export const LEAVING_REASON_LABELS: Record<SchoolLeavingReason, string> = {
  COMPLETED_FORM_4: "Completed Form 4",
  COMPLETED_UPPER_6: "Completed Upper 6",
  FEES: "Fees",
  TRANSFERRED_TO_ANOTHER_SCHOOL: "Transferred to another school",
  MOVED_ABROAD: "Moved abroad",
  EXPELLED: "Expelled",
  WITHDRAWN_BY_GUARDIAN: "Withdrawn by guardian",
  OTHER: "Other",
};

export const CLEARANCE_LABELS: Record<SchoolLeaverClearanceKind, string> = {
  FEES: "Fees",
  LIBRARY: "Library",
  BOARDING: "Bed",
  PORTAL: "Portal",
  RESULTS: "Docs",
};

/**
 * What a closed leaver's pupil record becomes.
 *
 * Only the two completion reasons graduate. A pupil who transferred, was
 * expelled, left over fees, moved abroad or was withdrawn by a guardian is
 * `WITHDRAWN`: marking them `GRADUATED` would report and display them as a
 * graduate of this school, on a statistic a head quotes and on a reference
 * somebody writes years later.
 */
export function statusAfterLeaving(
  reason: SchoolLeavingReason,
): "GRADUATED" | "WITHDRAWN" {
  return reason === "COMPLETED_FORM_4" || reason === "COMPLETED_UPPER_6"
    ? "GRADUATED"
    : "WITHDRAWN";
}

export const CLEARANCE_ORDER: SchoolLeaverClearanceKind[] = [
  "FEES",
  "LIBRARY",
  "BOARDING",
  "PORTAL",
  "RESULTS",
];

/**
 * What the five marks look like right now, read from the records that own them.
 *
 * This is the proposal, not the answer: `SchoolLeaverClearance.state` is what
 * the queue draws, and a `DONE` on an outstanding balance is the head waiving
 * it. The detail string is the evidence, shown beside the mark so a reader sees
 * what the derivation found rather than trusting it.
 */
export async function deriveClearances(args: {
  companyId: string;
  studentId: string;
}): Promise<Record<SchoolLeaverClearanceKind, { proposed: "DONE" | "TODO" | "NOT_APPLICABLE"; detail: string }>> {
  const { companyId, studentId } = args;
  const [invoices, loans, allocation, student, publishWindows] = await Promise.all([
    prisma.schoolFeeInvoice.findMany({
      where: { companyId, studentId, status: { notIn: ["VOIDED", "DRAFT"] } },
      select: { invoiceNo: true, balanceAmount: true },
    }),
    prisma.schoolBookLoan.findMany({
      where: { companyId, studentId, returnedAt: null },
      select: { id: true, dueAt: true, fineAmount: true, copy: { select: { book: { select: { title: true } } } } },
    }),
    prisma.schoolBoardingAllocation.findFirst({
      where: { companyId, studentId, status: "ACTIVE" },
      select: { id: true, bed: { select: { code: true } } },
    }),
    prisma.schoolStudent.findFirst({
      where: { id: studentId, companyId },
      select: { id: true, isBoarding: true, userId: true },
    }),
    prisma.schoolPublishWindow.findMany({
      where: { companyId },
      select: { id: true, openAt: true, closeAt: true },
      orderBy: { openAt: "desc" },
      take: 1,
    }),
  ]);

  const owed = invoices.reduce(
    (total, invoice) => total.plus(invoice.balanceAmount),
    new Prisma.Decimal(0),
  );
  const owing = invoices.filter((invoice) => invoice.balanceAmount.greaterThan(0));
  const window = publishWindows[0];
  const now = new Date();
  const published = window ? window.openAt <= now : false;

  return {
    FEES: owed.greaterThan(0)
      ? {
          proposed: "TODO",
          detail: `$${owed.toFixed(2)} on ${owing.map((invoice) => invoice.invoiceNo).join(", ")}`,
        }
      : { proposed: "DONE", detail: "Nothing owed" },
    LIBRARY:
      loans.length > 0
        ? {
            proposed: "TODO",
            detail: `${loans.length} ${loans.length === 1 ? "book" : "books"} out — ${loans
              .map((loan) => loan.copy.book.title)
              .slice(0, 3)
              .join(", ")}`,
          }
        : { proposed: "DONE", detail: "Nothing out" },
    BOARDING: !student?.isBoarding
      ? // A day pupil has no bed to give back. `NOT_APPLICABLE` is a real
        // answer and not a silent pass.
        { proposed: "NOT_APPLICABLE", detail: "Day pupil" }
      : allocation
        ? { proposed: "TODO", detail: `Still in ${allocation.bed?.code ?? "a bed"}` }
        : { proposed: "DONE", detail: "Bed given back" },
    PORTAL: student?.userId
      ? { proposed: "TODO", detail: "Account still open" }
      : { proposed: "DONE", detail: "No account" },
    RESULTS: published
      ? { proposed: "DONE", detail: "Results published" }
      : {
          proposed: "TODO",
          detail: window
            ? `Results publish ${window.openAt.toISOString().slice(0, 10)}`
            : "No publish window open",
        },
  };
}

export type LeaverRow = {
  id: string;
  lastDay: Date;
  reason: SchoolLeavingReason;
  reasonNote: string | null;
  status: string;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
  };
  clearances: Array<{
    kind: SchoolLeaverClearanceKind;
    state: "TODO" | "DONE" | "NOT_APPLICABLE";
    detail: string | null;
    overrideNote: string | null;
  }>;
  /** What the queue's `Next step` column says, in the words somebody acts on. */
  nextStep: string;
  owed: string;
};

const LEAVER_SELECT = {
  id: true,
  lastDay: true,
  reason: true,
  reasonNote: true,
  status: true,
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      currentClass: { select: { name: true } },
      currentStream: { select: { name: true } },
    },
  },
  clearances: {
    select: { kind: true, state: true, detail: true, overrideNote: true },
  },
} satisfies Prisma.SchoolLeaverSelect;

/**
 * The `Next step` column.
 *
 * Named for the job rather than for the state: `Take the book back` is
 * something a librarian does this afternoon, and `LIBRARY: TODO` is a status a
 * reader has to translate. Where more than one mark is outstanding the money
 * leads, because that is the one a family has to be asked about.
 */
function nextStepFor(
  clearances: Array<{ kind: SchoolLeaverClearanceKind; state: string; detail: string | null }>,
): string {
  const open = clearances.filter((row) => row.state === "TODO");
  if (open.length === 0) return "Close the record";
  const fees = open.find((row) => row.kind === "FEES");
  if (fees) return `Chase ${fees.detail?.split(" on ")[0] ?? "the fees"}`;
  const library = open.find((row) => row.kind === "LIBRARY");
  if (library) return "Take the book back";
  const boarding = open.find((row) => row.kind === "BOARDING");
  if (boarding) return "Free the bed";
  const portal = open.find((row) => row.kind === "PORTAL");
  if (portal) return "Close the portal";
  return "Raise the documents";
}

export async function leaverQueue(args: {
  companyId: string;
  status?: "open" | "closed";
  reason?: SchoolLeavingReason;
  level?: number;
  classId?: string;
  streamId?: string;
  clearance?: "cleared" | "not-cleared";
  search?: string;
}): Promise<LeaverRow[]> {
  const where: Prisma.SchoolLeaverWhereInput = { companyId: args.companyId };
  if (args.status === "open") where.status = "OPEN";
  if (args.status === "closed") where.status = "CLOSED";
  if (args.reason) where.reason = args.reason;
  // All three narrow the same relation, so they compose into one filter. The
  // screen sends a class and a stream, not a level: a filter that matched any
  // pupil who had *a* class reported itself as active and narrowed nothing.
  if (args.level != null || args.classId || args.streamId) {
    where.student = {
      ...(args.classId ? { currentClassId: args.classId } : {}),
      ...(args.streamId ? { currentStreamId: args.streamId } : {}),
      ...(args.level != null ? { currentClass: { level: args.level } } : {}),
    };
  }
  if (args.search?.trim()) {
    const term = args.search.trim();
    where.OR = [
      { student: { firstName: { contains: term, mode: "insensitive" } } },
      { student: { lastName: { contains: term, mode: "insensitive" } } },
      { student: { studentNo: { contains: term, mode: "insensitive" } } },
    ];
  }

  const leavers = await prisma.schoolLeaver.findMany({
    where,
    select: LEAVER_SELECT,
    orderBy: { lastDay: "desc" },
  });

  const rows = leavers.map((leaver) => {
    const fees = leaver.clearances.find((row) => row.kind === "FEES");
    // Parsed from the evidence whatever the mark says. Reading it only while
    // the mark is `TODO` meant a closed record always showed nothing owed —
    // and since a record cannot close with a mark outstanding, "Gone, still
    // owing" could never show anybody at all. The mark being `DONE` over a
    // balance is the head waiving it; the balance is still what the family
    // owes, and that is the number that section exists to show.
    const owed = fees?.detail?.match(/\$([\d.,]+)/)?.[1]?.replace(/,/g, "") ?? "0.00";
    return {
      ...leaver,
      student: {
        id: leaver.student.id,
        studentNo: leaver.student.studentNo,
        firstName: leaver.student.firstName,
        lastName: leaver.student.lastName,
        className: leaver.student.currentClass?.name ?? null,
        streamName: leaver.student.currentStream?.name ?? null,
      },
      clearances: leaver.clearances,
      nextStep: nextStepFor(leaver.clearances),
      owed,
    };
  });

  if (args.clearance === "cleared") {
    return rows.filter((row) => row.clearances.every((mark) => mark.state !== "TODO"));
  }
  if (args.clearance === "not-cleared") {
    return rows.filter((row) => row.clearances.some((mark) => mark.state === "TODO"));
  }
  return rows;
}

export type LeaverTallies = {
  inTheQueue: number;
  notCleared: number;
  owingOnExit: string;
  documentsOutstanding: number;
};

export async function leaverTallies(args: { companyId: string }): Promise<LeaverTallies> {
  const rows = await leaverQueue({ companyId: args.companyId, status: "open" });
  const owing = rows.reduce((total, row) => total.plus(row.owed), new Prisma.Decimal(0));
  return {
    inTheQueue: rows.length,
    notCleared: rows.filter((row) => row.clearances.some((mark) => mark.state === "TODO")).length,
    owingOnExit: owing.toFixed(2),
    documentsOutstanding: rows.filter((row) =>
      row.clearances.some((mark) => mark.kind === "RESULTS" && mark.state === "TODO"),
    ).length,
  };
}

/**
 * `Gone, still owing` — the leavers whose record closed with money outstanding.
 *
 * Its own section rather than a filter on the queue, because these are not
 * work-in-progress: the pupil has gone, and what is left is a debt somebody has
 * to decide whether to chase. A school that hid them inside the queue would
 * find them again a year later.
 *
 * The balance is read **live** rather than from the clearance mark's evidence.
 * A mark is a snapshot taken when the record closed; a family that paid in
 * January should not still appear here in March, and one whose cheque bounced
 * should.
 */
export async function goneStillOwing(args: { companyId: string }) {
  const rows = await leaverQueue({ companyId: args.companyId, status: "closed" });
  if (rows.length === 0) return [];

  const invoices = await prisma.schoolFeeInvoice.groupBy({
    by: ["studentId"],
    where: {
      companyId: args.companyId,
      studentId: { in: rows.map((row) => row.student.id) },
      status: { notIn: ["VOIDED", "DRAFT"] },
    },
    _sum: { balanceAmount: true },
  });
  const owedByStudent = new Map(
    invoices.map((row) => [row.studentId, row._sum.balanceAmount ?? new Prisma.Decimal(0)]),
  );

  return rows
    .map((row) => ({
      ...row,
      owed: (owedByStudent.get(row.student.id) ?? new Prisma.Decimal(0)).toFixed(2),
    }))
    .filter((row) => Number(row.owed) > 0);
}

/** Open a leaver, with the five marks proposed from the records that own them. */
export async function recordLeaver(args: {
  companyId: string;
  actorId: string;
  studentId: string;
  lastDay: Date;
  reason: SchoolLeavingReason;
  reasonNote?: string | null;
}) {
  const student = await prisma.schoolStudent.findFirst({
    where: { id: args.studentId, companyId: args.companyId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!student) throw new LeaverError("That pupil is not on this school's roll.");

  const existing = await prisma.schoolLeaver.findFirst({
    where: { studentId: args.studentId },
    select: { id: true, status: true },
  });
  if (existing) {
    throw new LeaverError(
      existing.status === "OPEN"
        ? `${student.firstName} ${student.lastName} is already in the leaving queue.`
        : `${student.firstName} ${student.lastName} has already left. A second departure needs the first record reopened.`,
    );
  }

  const derived = await deriveClearances({
    companyId: args.companyId,
    studentId: args.studentId,
  });

  return prisma.$transaction(async (tx) => {
    const leaver = await tx.schoolLeaver.create({
      data: {
        companyId: args.companyId,
        studentId: args.studentId,
        lastDay: args.lastDay,
        reason: args.reason,
        reasonNote: args.reasonNote?.trim() || null,
        openedByUserId: args.actorId,
        clearances: {
          create: CLEARANCE_ORDER.map((kind) => ({
            companyId: args.companyId,
            kind,
            state: derived[kind].proposed,
            detail: derived[kind].detail,
            ...(derived[kind].proposed !== "TODO"
              ? { markedAt: new Date(), markedByUserId: args.actorId }
              : {}),
          })),
        },
      },
      select: { id: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.leaver.opened",
      entityType: "SchoolLeaver",
      entityId: leaver.id,
      payload: { studentId: args.studentId, reason: args.reason },
    });
    return leaver;
  });
}

/**
 * Which marks each role may settle.
 *
 * `schools.leavers:clear` is held by three offices and `WHO_CAN` already says
 * what the grant means: "the bursar, the librarian or the warden, each for
 * their own mark". The grant alone could not express that, so a bursar could
 * mark the library and the bed done and make a record closable without the
 * office that actually holds the book or the key.
 *
 * The office that owns a mark is the office that can see whether it is true.
 * A registrar or an administrator settles any of them, because closing the
 * record is theirs and somebody has to be able to finish a queue when a
 * librarian is on leave — but they do it as themselves, and the audit row says
 * so.
 */
const CLEARANCE_BY_ROLE: Record<string, SchoolLeaverClearanceKind[]> = {
  BURSAR: ["FEES"],
  WARDEN: ["BOARDING"],
  TEACHER: [],
  HOD: ["RESULTS"],
  REGISTRAR: ["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"],
  SCHOOL_ADMIN: ["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"],
  SUPERADMIN: ["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"],
  MANAGER: ["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"],
};

/** Who settles this mark, for the sentence a refusal is written in. */
const CLEARANCE_OWNER: Record<SchoolLeaverClearanceKind, string> = {
  FEES: "the bursar",
  LIBRARY: "the librarian or the office",
  BOARDING: "the warden",
  PORTAL: "the office",
  RESULTS: "the head of department or the office",
};

/**
 * Returns null where this role may settle this mark, or the refusal to give.
 *
 * Kept here rather than in the route so the rule sits beside the marks it is
 * about, and so a second caller cannot forget it.
 */
export function clearanceDenial(
  role: string | null | undefined,
  kind: SchoolLeaverClearanceKind,
): string | null {
  const allowed = CLEARANCE_BY_ROLE[(role ?? "").trim().toUpperCase()];
  if (allowed?.includes(kind)) return null;
  return `${CLEARANCE_LABELS[kind]} is ${CLEARANCE_OWNER[kind]} to settle. You can see it here; ask them to mark it.`;
}

/** Settle one of the five marks, with the override the derivation cannot make. */
export async function markClearance(args: {
  companyId: string;
  actorId: string;
  leaverId: string;
  kind: SchoolLeaverClearanceKind;
  state: "TODO" | "DONE" | "NOT_APPLICABLE";
  overrideNote?: string | null;
}) {
  const clearance = await prisma.schoolLeaverClearance.findFirst({
    where: { companyId: args.companyId, leaverId: args.leaverId, kind: args.kind },
    select: { id: true, detail: true },
  });
  if (!clearance) throw new LeaverError("That mark is not on this leaver.");

  return prisma.$transaction(async (tx) => {
    const updated = await tx.schoolLeaverClearance.update({
      where: { id: clearance.id },
      data: {
        state: args.state,
        overrideNote: args.overrideNote?.trim() || null,
        markedAt: new Date(),
        markedByUserId: args.actorId,
      },
      select: { id: true, state: true },
    });
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.leaver.clearance.marked",
      entityType: "SchoolLeaver",
      entityId: args.leaverId,
      reason: args.overrideNote?.trim(),
      // The evidence at the moment of the override, because that is the thing
      // somebody will be asked about: marked done against what.
      payload: { kind: args.kind, state: args.state, evidence: clearance.detail },
    });
    return updated;
  });
}

/**
 * Close the record, and put them on the alumni register.
 *
 * Closing refuses while a mark is outstanding — the whole point of the queue is
 * that a record does not close over an unreturned book — and the override is
 * the way past it, which is a decision with a name on it rather than a
 * shortcut.
 */
export async function closeLeaver(args: {
  companyId: string;
  actorId: string;
  leaverId: string;
}) {
  const leaver = await prisma.schoolLeaver.findFirst({
    where: { id: args.leaverId, companyId: args.companyId },
    select: {
      id: true,
      status: true,
      lastDay: true,
      reason: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          house: true,
          currentClass: { select: { name: true } },
          currentStream: { select: { name: true } },
        },
      },
      clearances: { select: { kind: true, state: true } },
    },
  });
  if (!leaver) throw new LeaverError("That leaver is not this school's.");
  if (leaver.status === "CLOSED") throw new LeaverError("That record is already closed.");

  const outstanding = leaver.clearances.filter((mark) => mark.state === "TODO");
  if (outstanding.length > 0) {
    throw new LeaverError(
      `${outstanding.map((mark) => CLEARANCE_LABELS[mark.kind]).join(", ")} ${outstanding.length === 1 ? "is" : "are"} still outstanding. Settle ${outstanding.length === 1 ? "it" : "them"}, or mark ${outstanding.length === 1 ? "it" : "them"} done with a reason — a record that closes over an unreturned book is the thing this queue exists to prevent.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const closed = await tx.schoolLeaver.update({
      where: { id: leaver.id },
      data: { status: "CLOSED", closedAt: new Date(), closedByUserId: args.actorId },
      select: { id: true },
    });
    // The pupil leaves the roll and joins the register. Both, in one act: a
    // graduating pupil who is not on the alumni register is the gap S-13.4 was
    // written to close. The status follows the reason — see
    // `statusAfterLeaving`; an expelled pupil is not a graduate.
    await tx.schoolStudent.update({
      where: { id: leaver.student.id },
      data: { status: statusAfterLeaving(leaver.reason) },
    });
    const already = await tx.schoolAlumnus.findFirst({
      where: { studentId: leaver.student.id },
      select: { id: true },
    });
    if (!already) {
      await tx.schoolAlumnus.create({
        data: {
          companyId: args.companyId,
          studentId: leaver.student.id,
          leaverId: leaver.id,
          firstName: leaver.student.firstName,
          lastName: leaver.student.lastName,
          classOf: leaver.lastDay.getFullYear(),
          finalClassName:
            [leaver.student.currentClass?.name, leaver.student.currentStream?.name]
              .filter(Boolean)
              .join(" ") || null,
          house: leaver.student.house,
        },
      });
    }
    await writeSchoolAuditEvent(tx, {
      companyId: args.companyId,
      actorId: args.actorId,
      eventType: "schools.leaver.closed",
      entityType: "SchoolLeaver",
      entityId: leaver.id,
      payload: {
        studentId: leaver.student.id,
        classOf: leaver.lastDay.getFullYear(),
        reason: leaver.reason,
        status: statusAfterLeaving(leaver.reason),
      },
    });
    return closed;
  });
}

/* ── the five leaving documents ──────────────────────────────────────── */

export type LeavingDocumentKey =
  | "schools.leaving-certificate"
  | "schools.testimonial"
  | "schools.statement-of-results"
  | "schools.fees-clearance"
  | "schools.transfer-letter";

export const LEAVING_DOCUMENTS: Array<{
  key: LeavingDocumentKey;
  label: string;
  /** Which clearance mark has to be settled before it can be raised. */
  needs: SchoolLeaverClearanceKind | null;
}> = [
  { key: "schools.leaving-certificate", label: "School-leaving certificate", needs: "FEES" },
  { key: "schools.testimonial", label: "Testimonial", needs: null },
  { key: "schools.statement-of-results", label: "Statement of results", needs: "RESULTS" },
  { key: "schools.fees-clearance", label: "Fees-clearance letter", needs: "FEES" },
  { key: "schools.transfer-letter", label: "Transfer certificate", needs: null },
];

/**
 * The five documents, and whether each can be raised yet.
 *
 * Only one of the five exists as a document source today —
 * `schools.transfer-letter`. The other four are named here so the screen can
 * say what is blocked and why while the resolvers are written, rather than
 * drawing five buttons that three of them cannot honour.
 */
export async function leavingDocuments(args: { companyId: string; leaverId: string }) {
  const leaver = await prisma.schoolLeaver.findFirst({
    where: { id: args.leaverId, companyId: args.companyId },
    select: {
      id: true,
      lastDay: true,
      reason: true,
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          currentClass: { select: { name: true } },
          currentStream: { select: { name: true } },
        },
      },
      clearances: { select: { kind: true, state: true, detail: true } },
    },
  });
  if (!leaver) throw new LeaverError("That leaver is not this school's.");

  const byKind = new Map(leaver.clearances.map((mark) => [mark.kind, mark]));
  // What the pipeline can already render. `SCHOOL_DOCUMENT_SOURCE_KEYS` holds
  // eight keys and exactly one of the five leaving documents is among them.
  const built = new Set<LeavingDocumentKey>(["schools.transfer-letter"]);

  const documents = LEAVING_DOCUMENTS.map((document) => {
    const mark = document.needs ? byKind.get(document.needs) : null;
    const blockedBy = mark && mark.state === "TODO" ? mark : null;
    return {
      key: document.key,
      label: document.label,
      state: !built.has(document.key)
        ? ("not-built" as const)
        : blockedBy
          ? ("blocked" as const)
          : ("ready" as const),
      detail: blockedBy
        ? `${CLEARANCE_LABELS[blockedBy.kind]}: ${blockedBy.detail ?? "outstanding"}`
        : built.has(document.key)
          ? "Ready to raise"
          : "The template for this one has not been written yet",
      needs: document.needs,
    };
  });

  return { leaver, documents };
}

/* ── alumni ──────────────────────────────────────────────────────────── */

export type AlumniFilters = {
  companyId: string;
  classOf?: number;
  house?: string;
  destinationKind?: string;
  consent?: string;
  search?: string;
};

export async function alumniRegister(filters: AlumniFilters) {
  const where: Prisma.SchoolAlumnusWhereInput = { companyId: filters.companyId };
  if (filters.classOf) where.classOf = filters.classOf;
  if (filters.house) where.house = filters.house;
  if (filters.destinationKind) {
    where.destinationKind = filters.destinationKind as Prisma.EnumSchoolAlumniDestinationKindFilter["equals"];
  }
  if (filters.consent) {
    where.contactConsent = filters.consent as Prisma.EnumSchoolAlumniContactConsentFilter["equals"];
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    where.OR = [
      { firstName: { contains: term, mode: "insensitive" } },
      { lastName: { contains: term, mode: "insensitive" } },
      { destination: { contains: term, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.schoolAlumnus.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classOf: true,
      finalClassName: true,
      house: true,
      email: true,
      phone: true,
      contactConsent: true,
      destinationKind: true,
      destination: true,
      destinationConfirmedAt: true,
      studentId: true,
    },
    orderBy: [{ classOf: "desc" }, { lastName: "asc" }],
    take: 500,
  });

  // Results on leaving: the public exam grades, where the school has them.
  const studentIds = rows.map((row) => row.studentId).filter((id): id is string => Boolean(id));
  const results =
    studentIds.length > 0
      ? await prisma.schoolExamResult.findMany({
          where: { companyId: filters.companyId, candidate: { studentId: { in: studentIds } } },
          select: {
            grade: true,
            candidate: { select: { studentId: true } },
            series: { select: { level: true } },
          },
        })
      : [];

  const byStudent = new Map<string, { passes: number; grades: number }>();
  for (const result of results) {
    const key = result.candidate.studentId;
    const seen = byStudent.get(key) ?? { passes: 0, grades: 0 };
    seen.grades += 1;
    if (["A*", "A", "B", "C"].includes(result.grade.toUpperCase())) seen.passes += 1;
    byStudent.set(key, seen);
  }

  return rows.map((row) => ({
    ...row,
    results: row.studentId ? (byStudent.get(row.studentId) ?? null) : null,
  }));
}

export async function alumniTallies(args: { companyId: string; year?: number }) {
  const thisYear = args.year ?? new Date().getFullYear();
  const [total, leftThisYear, unknown, neverAsked, consentGiven, withDestination] =
    await Promise.all([
      prisma.schoolAlumnus.count({ where: { companyId: args.companyId } }),
      prisma.schoolAlumnus.count({ where: { companyId: args.companyId, classOf: thisYear } }),
      prisma.schoolAlumnus.count({
        where: { companyId: args.companyId, destinationKind: "UNKNOWN" },
      }),
      prisma.schoolAlumnus.count({
        where: { companyId: args.companyId, contactConsent: "NOT_ASKED" },
      }),
      prisma.schoolAlumnus.count({
        where: { companyId: args.companyId, contactConsent: "MAY_CONTACT" },
      }),
      prisma.schoolAlumnus.count({
        where: { companyId: args.companyId, destinationKind: { not: "UNKNOWN" } },
      }),
    ]);
  // `Destination recorded, by leaving year` — the share of each leaving year
  // the school still knows something about. It decays with age, and seeing
  // where it decays is the point: a development office works the years it can
  // still reach.
  const byYear = await prisma.schoolAlumnus.groupBy({
    by: ["classOf"],
    where: { companyId: args.companyId },
    _count: { _all: true },
    orderBy: { classOf: "desc" },
    take: 12,
  });
  const knownByYear = await prisma.schoolAlumnus.groupBy({
    by: ["classOf"],
    where: { companyId: args.companyId, destinationKind: { not: "UNKNOWN" } },
    _count: { _all: true },
  });
  const knownMap = new Map(knownByYear.map((row) => [row.classOf, row._count._all]));

  return {
    onTheRegister: total,
    leftThisYear,
    destinationUnknown: unknown,
    consentNeverAsked: neverAsked,
    destinationByYear: byYear.map((row) => ({
      classOf: row.classOf,
      recorded: knownMap.get(row.classOf) ?? 0,
      of: row._count._all,
    })),
    // `How much of the register is kept` — the measure/count/of/share table.
    kept: [
      { measure: "Contact consent given", count: consentGiven, of: total },
      { measure: "Destination recorded", count: withDestination, of: total },
      {
        measure: "An address or a number",
        count: await prisma.schoolAlumnus.count({
          where: {
            companyId: args.companyId,
            OR: [{ email: { not: null } }, { phone: { not: null } }],
          },
        }),
        of: total,
      },
    ],
  };
}

export async function alumnusRecord(args: { companyId: string; alumnusId: string }) {
  const alumnus = await prisma.schoolAlumnus.findFirst({
    where: { id: args.alumnusId, companyId: args.companyId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      classOf: true,
      finalClassName: true,
      house: true,
      email: true,
      phone: true,
      addressLine: true,
      contactConsent: true,
      consentGivenAt: true,
      destinationKind: true,
      destination: true,
      destinationConfirmedAt: true,
      notes: true,
      studentId: true,
      updates: {
        select: {
          id: true,
          happenedOn: true,
          summary: true,
          documentReference: true,
          recordedByUserId: true,
        },
        orderBy: { happenedOn: "desc" },
      },
    },
  });
  if (!alumnus) throw new LeaverError("That former pupil is not on this register.");

  const [results, honours, conduct] = await Promise.all([
    alumnus.studentId
      ? prisma.schoolExamResult.findMany({
          where: {
            companyId: args.companyId,
            candidate: { studentId: alumnus.studentId },
          },
          select: {
            grade: true,
            points: true,
            examSubject: { select: { name: true, level: true } },
            series: { select: { name: true, level: true } },
          },
        })
      : Promise.resolve([]),
    alumnus.studentId
      ? prisma.schoolStudentHonour.findMany({
          where: { companyId: args.companyId, studentId: alumnus.studentId },
          select: { id: true, kind: true, year: true, title: true },
          orderBy: { year: "asc" },
        })
      : Promise.resolve([]),
    alumnus.studentId
      ? prisma.schoolConductIncident.count({
          where: { companyId: args.companyId, studentId: alumnus.studentId },
        })
      : Promise.resolve(0),
    ]);

  const merits = alumnus.studentId
    ? await prisma.schoolMeritEntry.count({
        where: {
          companyId: args.companyId,
          studentId: alumnus.studentId,
          kind: "MERIT",
          reversedAt: null,
        },
      })
    : 0;

  return {
    alumnus,
    results,
    honours,
    // `Clear · two merits in Upper Sixth` — the one-line conduct summary the
    // record draws. It reads the conduct tables rather than restating them.
    conduct: {
      incidents: conduct,
      merits,
      summary:
        conduct === 0
          ? merits > 0
            ? `Clear · ${merits} ${merits === 1 ? "merit" : "merits"}`
            : "Clear"
          : `${conduct} ${conduct === 1 ? "incident" : "incidents"} on the record`,
    },
  };
}

export async function recordConsent(args: {
  companyId: string;
  actorId: string;
  alumnusId: string;
  consent: "MAY_CONTACT" | "NO_CONTACT" | "NOT_ASKED";
}) {
  const alumnus = await prisma.schoolAlumnus.findFirst({
    where: { id: args.alumnusId, companyId: args.companyId },
    select: { id: true },
  });
  if (!alumnus) throw new LeaverError("That former pupil is not on this register.");
  return prisma.schoolAlumnus.update({
    where: { id: alumnus.id },
    data: {
      contactConsent: args.consent,
      // Who asked and when, because "nobody has asked" and "they said no" are
      // different answers and the third state is the one that matters.
      consentGivenByUserId: args.consent === "NOT_ASKED" ? null : args.actorId,
      consentGivenAt: args.consent === "NOT_ASKED" ? null : new Date(),
    },
    select: { id: true, contactConsent: true },
  });
}

export async function recordDestination(args: {
  companyId: string;
  alumnusId: string;
  destinationKind: string;
  destination?: string | null;
}) {
  const alumnus = await prisma.schoolAlumnus.findFirst({
    where: { id: args.alumnusId, companyId: args.companyId },
    select: { id: true },
  });
  if (!alumnus) throw new LeaverError("That former pupil is not on this register.");
  return prisma.schoolAlumnus.update({
    where: { id: alumnus.id },
    data: {
      destinationKind: args.destinationKind as Prisma.SchoolAlumnusUpdateInput["destinationKind"],
      destination: args.destination?.trim() || null,
      // A destination with no date is a rumour.
      destinationConfirmedAt: new Date(),
    },
    select: { id: true },
  });
}

export async function addAlumniUpdate(args: {
  companyId: string;
  actorId: string;
  alumnusId: string;
  happenedOn: Date;
  summary: string;
  documentReference?: string | null;
}) {
  const alumnus = await prisma.schoolAlumnus.findFirst({
    where: { id: args.alumnusId, companyId: args.companyId },
    select: { id: true },
  });
  if (!alumnus) throw new LeaverError("That former pupil is not on this register.");
  return prisma.schoolAlumniUpdate.create({
    data: {
      companyId: args.companyId,
      alumnusId: alumnus.id,
      happenedOn: args.happenedOn,
      summary: args.summary.trim(),
      documentReference: args.documentReference?.trim() || null,
      recordedByUserId: args.actorId,
    },
    select: { id: true },
  });
}
