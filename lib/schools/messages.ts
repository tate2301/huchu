import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Messages between a family and the school.
 *
 * All three prototypes show messaging — the parent's "Messages from teachers",
 * the teacher's "Parent messages", the pupil's inbox — and there was no model
 * behind any of it; `/portal/teacher/messages` returned a 404 that three links
 * pointed at. This is that model, deliberately smaller than the demos imply.
 *
 * Two parties and a named child. Not a group chat: a school's messaging has to
 * answer "who could read this" for a safeguarding officer a year later, and a
 * room anybody can be added to cannot answer it. A thread is one guardian, one
 * member of staff (or the office), and the pupil it concerns.
 *
 * Nothing is edited and nothing is deleted. What a parent was told has to still
 * be true when somebody checks, so a correction is another message rather than
 * a rewrite of the one before it.
 */

export class MessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageError";
  }
}

export type MessageSide = "GUARDIAN" | "STAFF";

export type ThreadSummary = {
  id: string;
  subject: string;
  student: { id: string; firstName: string; lastName: string } | null;
  guardian: { id: string; firstName: string; lastName: string };
  staff: { id: string; name: string } | null;
  lastMessageAt: Date;
  lastMessagePreview: string;
  unread: boolean;
  closed: boolean;
  messageCount: number;
};

/**
 * Whether a thread has something new for one side.
 *
 * Derived, never stored. A stored counter and the messages it counts drift
 * apart — a badge saying 2 over an empty inbox is the thing people stop
 * trusting — so unread is "the last message is not mine and I have not opened
 * it since".
 */
function isUnreadFor(
  side: MessageSide,
  thread: { lastMessageAt: Date; guardianReadAt: Date | null; staffReadAt: Date | null },
  lastSenderSide: MessageSide | null,
): boolean {
  if (lastSenderSide === side) return false;
  const readAt = side === "GUARDIAN" ? thread.guardianReadAt : thread.staffReadAt;
  if (!readAt) return true;
  return readAt < thread.lastMessageAt;
}

function summarise(
  thread: {
    id: string;
    subject: string;
    lastMessageAt: Date;
    guardianReadAt: Date | null;
    staffReadAt: Date | null;
    closedAt: Date | null;
    student: { id: string; firstName: string; lastName: string } | null;
    guardian: { id: string; firstName: string; lastName: string };
    teacherProfile: { id: string; user: { name: string | null } } | null;
    messages: Array<{ body: string; senderSide: MessageSide }>;
    _count: { messages: number };
  },
  side: MessageSide,
): ThreadSummary {
  const last = thread.messages[0] ?? null;
  return {
    id: thread.id,
    subject: thread.subject,
    student: thread.student,
    guardian: thread.guardian,
    staff: thread.teacherProfile
      ? { id: thread.teacherProfile.id, name: thread.teacherProfile.user.name ?? "Staff" }
      : null,
    lastMessageAt: thread.lastMessageAt,
    lastMessagePreview: last?.body.slice(0, 160) ?? "",
    unread: isUnreadFor(side, thread, last?.senderSide ?? null),
    closed: thread.closedAt != null,
    messageCount: thread._count.messages,
  };
}

const THREAD_SELECT = {
  id: true,
  subject: true,
  lastMessageAt: true,
  guardianReadAt: true,
  staffReadAt: true,
  closedAt: true,
  student: { select: { id: true, firstName: true, lastName: true } },
  guardian: { select: { id: true, firstName: true, lastName: true } },
  teacherProfile: { select: { id: true, user: { select: { name: true } } } },
  messages: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { body: true, senderSide: true },
  },
  _count: { select: { messages: true } },
} as const;

/**
 * The classes one teacher takes, shaped as a filter on a pupil.
 *
 * `SchoolStudent` carries the class it is in and `SchoolClassSubject` carries
 * the class a teacher was given, and there is no relation between the two to
 * traverse, so the pairs are read first and matched against the pupil's current
 * class. A subject with no stream is taught to the whole class, which is why
 * those entries do not constrain the stream.
 */
async function taughtBy(
  companyId: string,
  teacherProfileId: string,
): Promise<Prisma.SchoolStudentWhereInput[]> {
  const assignments = await prisma.schoolClassSubject.findMany({
    where: { companyId, teacherProfileId, isActive: true },
    select: { classId: true, streamId: true },
  });

  const seen = new Set<string>();
  const scopes: Prisma.SchoolStudentWhereInput[] = [];
  for (const assignment of assignments) {
    const key = `${assignment.classId}|${assignment.streamId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scopes.push({
      currentClassId: assignment.classId,
      ...(assignment.streamId ? { currentStreamId: assignment.streamId } : {}),
    });
  }
  return scopes;
}

/**
 * Refuses a teacher profile from another tenant.
 *
 * Both callers take the id from a client — a parent picking a teacher to write
 * to, the office handing a thread over — and an unscoped id would attach a
 * stranger to a family's conversation.
 */
async function requireStaff(companyId: string, teacherProfileId: string): Promise<void> {
  const staff = await prisma.schoolTeacherProfile.findFirst({
    where: { id: teacherProfileId, companyId },
    select: { id: true },
  });
  if (!staff) throw new MessageError("That member of staff was not found");
}

/** Whether a teacher takes the child a thread is about. */
async function teachesStudent(
  companyId: string,
  teacherProfileId: string,
  studentId: string,
): Promise<boolean> {
  const scopes = await taughtBy(companyId, teacherProfileId);
  if (scopes.length === 0) return false;
  const student = await prisma.schoolStudent.findFirst({
    where: { id: studentId, companyId, OR: scopes },
    select: { id: true },
  });
  return student != null;
}

/**
 * Whether a member of staff may read and answer one thread.
 *
 * A thread that names a teacher is theirs and nobody else's. A thread with no
 * teacher on it is addressed to the school, and "the school" is the office —
 * not everybody on the payroll. The subject line carries a child's name and the
 * body carries the family's business, so the office reads the queue, and a
 * teacher reads only the entries about children they actually take. A thread
 * naming no child at all is office work by definition.
 */
async function staffMayRead(
  companyId: string,
  thread: { teacherProfileId: string | null; studentId: string | null },
  caller: { teacherProfileId: string | null; officeRole: boolean },
): Promise<boolean> {
  if (thread.teacherProfileId != null) {
    return (
      caller.teacherProfileId != null &&
      thread.teacherProfileId === caller.teacherProfileId
    );
  }
  if (caller.officeRole) return true;
  if (caller.teacherProfileId == null || thread.studentId == null) return false;
  return teachesStudent(companyId, caller.teacherProfileId, thread.studentId);
}

/** A guardian's own threads. Scoped by their guardian record, never by a parameter. */
export async function threadsForGuardian(input: {
  companyId: string;
  guardianId: string;
}): Promise<ThreadSummary[]> {
  const threads = await prisma.schoolMessageThread.findMany({
    where: { companyId: input.companyId, guardianId: input.guardianId },
    orderBy: { lastMessageAt: "desc" },
    select: THREAD_SELECT,
  });
  return threads.map((thread) => summarise(thread, "GUARDIAN"));
}

/**
 * A teacher's own threads, plus the office queue they have standing in.
 *
 * A thread with no teacher on it is the school's to answer, and if it appeared
 * in nobody's inbox it would be a message a parent sent into silence. The
 * office sees all of them. A teacher sees the ones about children they take,
 * which is both the safeguarding answer and the useful one: those are the
 * threads they can actually reply to.
 */
export async function threadsForStaff(input: {
  companyId: string;
  teacherProfileId: string | null;
  /** True for the office roles, who hold the unassigned queue. */
  officeRole?: boolean;
}): Promise<ThreadSummary[]> {
  const scopes: Prisma.SchoolMessageThreadWhereInput[] = [];
  if (input.teacherProfileId) scopes.push({ teacherProfileId: input.teacherProfileId });

  if (input.officeRole) {
    scopes.push({ teacherProfileId: null });
  } else if (input.teacherProfileId) {
    const taught = await taughtBy(input.companyId, input.teacherProfileId);
    if (taught.length > 0) {
      scopes.push({ teacherProfileId: null, student: { is: { OR: taught } } });
    }
  }
  if (scopes.length === 0) return [];

  const threads = await prisma.schoolMessageThread.findMany({
    where: { companyId: input.companyId, OR: scopes },
    orderBy: { lastMessageAt: "desc" },
    select: THREAD_SELECT,
  });
  return threads.map((thread) => summarise(thread, "STAFF"));
}

/** Every thread in the school. The head's view, for oversight rather than reply. */
export async function allThreads(input: {
  companyId: string;
  take?: number;
}): Promise<ThreadSummary[]> {
  const threads = await prisma.schoolMessageThread.findMany({
    where: { companyId: input.companyId },
    orderBy: { lastMessageAt: "desc" },
    take: input.take ?? 200,
    select: THREAD_SELECT,
  });
  return threads.map((thread) => summarise(thread, "STAFF"));
}

export type ThreadDetail = ThreadSummary & {
  messages: Array<{
    id: string;
    body: string;
    senderSide: MessageSide;
    senderName: string;
    createdAt: Date;
  }>;
};

/**
 * One thread, with its messages — and marked read for the side that opened it.
 *
 * Reading and marking-read are the same act, so they are one call. Two calls is
 * how a badge survives the screen that was supposed to clear it.
 */
export async function openThread(input: {
  companyId: string;
  threadId: string;
  side: MessageSide;
  /** Pass to prove the caller owns this side of the thread. */
  guardianId?: string | null;
  teacherProfileId?: string | null;
  /** True for the office roles, who hold the unassigned queue. */
  officeRole?: boolean;
  /** Office and heads read without claiming a side. */
  readOnly?: boolean;
}): Promise<ThreadDetail> {
  const thread = await prisma.schoolMessageThread.findFirst({
    where: { id: input.threadId, companyId: input.companyId },
    select: {
      ...THREAD_SELECT,
      guardianId: true,
      studentId: true,
      teacherProfileId: true,
    },
  });
  if (!thread) throw new MessageError("That conversation was not found");

  if (!input.readOnly) {
    const ownsIt =
      input.side === "GUARDIAN"
        ? input.guardianId != null && thread.guardianId === input.guardianId
        : await staffMayRead(input.companyId, thread, {
            teacherProfileId: input.teacherProfileId ?? null,
            officeRole: input.officeRole ?? false,
          });
    // Same message as "not found", so probing ids teaches nothing about who is
    // talking to whom.
    if (!ownsIt) throw new MessageError("That conversation was not found");
  }

  const messages = await prisma.schoolMessage.findMany({
    where: { companyId: input.companyId, threadId: thread.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      body: true,
      senderSide: true,
      createdAt: true,
      sender: { select: { name: true } },
    },
  });

  if (!input.readOnly) {
    await prisma.schoolMessageThread.update({
      where: { id: thread.id },
      data:
        input.side === "GUARDIAN"
          ? { guardianReadAt: new Date() }
          : { staffReadAt: new Date() },
    });
  }

  return {
    ...summarise(thread, input.side),
    // Opened means read: the summary above was computed before the write, so
    // report the state the reader is now in rather than the one they arrived in.
    unread: false,
    messages: messages.map((message) => ({
      id: message.id,
      body: message.body,
      senderSide: message.senderSide,
      senderName: message.sender.name ?? "Unknown",
      createdAt: message.createdAt,
    })),
  };
}

/** Start a conversation. */
export async function startThread(input: {
  companyId: string;
  guardianId: string;
  senderUserId: string;
  senderSide: MessageSide;
  subject: string;
  body: string;
  studentId?: string | null;
  teacherProfileId?: string | null;
  /** True for the office roles, who write to any family in the school. */
  officeRole?: boolean;
}): Promise<{ id: string }> {
  const guardian = await prisma.schoolGuardian.findFirst({
    where: { id: input.guardianId, companyId: input.companyId },
    select: { id: true },
  });
  if (!guardian) throw new MessageError("Guardian not found");

  if (input.teacherProfileId) {
    await requireStaff(input.companyId, input.teacherProfileId);
  }

  if (input.studentId) {
    // A thread is about a child of *this* family, or it is a way to ask the
    // school about somebody else's.
    const link = await prisma.schoolStudentGuardian.findFirst({
      where: {
        companyId: input.companyId,
        guardianId: input.guardianId,
        studentId: input.studentId,
      },
      select: { id: true },
    });
    if (!link) throw new MessageError("That pupil is not linked to this family");
  }

  // The office writes to any family. A teacher writes to the families whose
  // children they take: without this, picking a guardian id out of the tenant
  // was enough to open a conversation with a household they have never taught,
  // which is the same reach a cold-call would have.
  if (input.senderSide === "STAFF" && !input.officeRole) {
    if (!input.teacherProfileId) {
      throw new MessageError("You are not linked to a teacher profile");
    }
    const scopes = await taughtBy(input.companyId, input.teacherProfileId);
    const taughtChild =
      scopes.length > 0 &&
      (await prisma.schoolStudentGuardian.findFirst({
        where: {
          companyId: input.companyId,
          guardianId: input.guardianId,
          ...(input.studentId ? { studentId: input.studentId } : {}),
          student: { is: { OR: scopes } },
        },
        select: { id: true },
      })) != null;
    if (!taughtChild) {
      throw new MessageError("That family is not one of yours");
    }
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const thread = await tx.schoolMessageThread.create({
      data: {
        companyId: input.companyId,
        guardianId: input.guardianId,
        studentId: input.studentId ?? null,
        teacherProfileId: input.teacherProfileId ?? null,
        subject: input.subject,
        lastMessageAt: now,
        // The side that opened it has, by definition, read it.
        guardianReadAt: input.senderSide === "GUARDIAN" ? now : null,
        staffReadAt: input.senderSide === "STAFF" ? now : null,
      },
      select: { id: true },
    });

    await tx.schoolMessage.create({
      data: {
        companyId: input.companyId,
        threadId: thread.id,
        senderUserId: input.senderUserId,
        senderSide: input.senderSide,
        body: input.body,
        createdAt: now,
      },
    });

    return thread;
  });
}

/** Add to a conversation. */
export async function replyToThread(input: {
  companyId: string;
  threadId: string;
  senderUserId: string;
  senderSide: MessageSide;
  body: string;
  guardianId?: string | null;
  teacherProfileId?: string | null;
  /** True for the office roles, who hold the unassigned queue. */
  officeRole?: boolean;
}): Promise<{ id: string }> {
  const thread = await prisma.schoolMessageThread.findFirst({
    where: { id: input.threadId, companyId: input.companyId },
    select: {
      id: true,
      guardianId: true,
      studentId: true,
      teacherProfileId: true,
      closedAt: true,
    },
  });
  if (!thread) throw new MessageError("That conversation was not found");
  if (thread.closedAt) throw new MessageError("That conversation has been closed");

  // Writing into a thread is governed by the same rule as reading it: a teacher
  // who cannot see an office-queue thread must not be able to answer one either.
  const ownsIt =
    input.senderSide === "GUARDIAN"
      ? input.guardianId != null && thread.guardianId === input.guardianId
      : await staffMayRead(input.companyId, thread, {
          teacherProfileId: input.teacherProfileId ?? null,
          officeRole: input.officeRole ?? false,
        });
  if (!ownsIt) throw new MessageError("That conversation was not found");

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const message = await tx.schoolMessage.create({
      data: {
        companyId: input.companyId,
        threadId: thread.id,
        senderUserId: input.senderUserId,
        senderSide: input.senderSide,
        body: input.body,
        createdAt: now,
      },
      select: { id: true },
    });

    await tx.schoolMessageThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: now,
        // Sending is reading, for the sender only. The other side's clock is
        // left alone, which is what makes their badge light up.
        ...(input.senderSide === "GUARDIAN"
          ? { guardianReadAt: now }
          : { staffReadAt: now }),
      },
    });

    return message;
  });
}

/** Close a conversation. Staff only — a parent cannot end the school's record. */
export async function closeThread(input: {
  companyId: string;
  threadId: string;
}): Promise<void> {
  const thread = await prisma.schoolMessageThread.findFirst({
    where: { id: input.threadId, companyId: input.companyId },
    select: { id: true },
  });
  if (!thread) throw new MessageError("That conversation was not found");
  await prisma.schoolMessageThread.update({
    where: { id: thread.id },
    data: { closedAt: new Date() },
  });
}

/**
 * Give a conversation to a member of staff — or hand it back to the office.
 *
 * A thread with no `teacherProfileId` is a general enquiry addressed to the
 * school rather than to a person. That is the case this model was built for and
 * the one nobody could act on: the office could read such a thread and close
 * it, but not put it in front of the person who can actually answer it.
 *
 * Assignment is deliberately one mutable field rather than a join table. A
 * conversation has exactly one member of staff on it at a time — that is what
 * lets a safeguarding officer answer "who could read this" a year later — so
 * handing it over is a move, not an addition, and the family sees who holds it
 * rather than having to write again.
 *
 * Passing `null` returns it to the office queue, which is what happens when a
 * teacher is away and somebody else has to pick it up.
 */
export async function assignThread(input: {
  companyId: string;
  threadId: string;
  teacherProfileId: string | null;
}): Promise<void> {
  const thread = await prisma.schoolMessageThread.findFirst({
    where: { id: input.threadId, companyId: input.companyId },
    select: { id: true, closedAt: true },
  });
  if (!thread) throw new MessageError("That conversation was not found");
  if (thread.closedAt) {
    throw new MessageError("That conversation is finished, so it cannot be passed on");
  }

  if (input.teacherProfileId) {
    await requireStaff(input.companyId, input.teacherProfileId);
  }

  await prisma.schoolMessageThread.update({
    where: { id: thread.id },
    data: {
      teacherProfileId: input.teacherProfileId,
      // The new holder has not read it, whoever had it before. Clearing this is
      // what puts the thread on their "your reply" list rather than leaving it
      // looking answered because somebody else once opened it.
      staffReadAt: null,
    },
  });
}

/** How many threads are waiting on this side. Drives the bell and the tab badge. */
export function countUnread(threads: ThreadSummary[]): number {
  return threads.filter((thread) => thread.unread).length;
}
