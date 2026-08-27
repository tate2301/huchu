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
 * A teacher's own threads, plus anything addressed to the office.
 *
 * A thread with no teacher on it is the school's to answer, and if it appeared
 * in nobody's inbox it would be a message a parent sent into silence. Whoever
 * in the office opens the portal sees it.
 */
export async function threadsForStaff(input: {
  companyId: string;
  teacherProfileId: string | null;
  includeOffice?: boolean;
}): Promise<ThreadSummary[]> {
  const scopes: Array<Record<string, unknown>> = [];
  if (input.teacherProfileId) scopes.push({ teacherProfileId: input.teacherProfileId });
  if (input.includeOffice ?? !input.teacherProfileId) scopes.push({ teacherProfileId: null });
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
  /** Office and heads read without claiming a side. */
  readOnly?: boolean;
}): Promise<ThreadDetail> {
  const thread = await prisma.schoolMessageThread.findFirst({
    where: { id: input.threadId, companyId: input.companyId },
    select: {
      ...THREAD_SELECT,
      guardianId: true,
      teacherProfileId: true,
    },
  });
  if (!thread) throw new MessageError("That conversation was not found");

  if (!input.readOnly) {
    const ownsIt =
      input.side === "GUARDIAN"
        ? input.guardianId != null && thread.guardianId === input.guardianId
        : thread.teacherProfileId == null ||
          (input.teacherProfileId != null && thread.teacherProfileId === input.teacherProfileId);
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
}): Promise<{ id: string }> {
  const guardian = await prisma.schoolGuardian.findFirst({
    where: { id: input.guardianId, companyId: input.companyId },
    select: { id: true },
  });
  if (!guardian) throw new MessageError("Guardian not found");

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
}): Promise<{ id: string }> {
  const thread = await prisma.schoolMessageThread.findFirst({
    where: { id: input.threadId, companyId: input.companyId },
    select: { id: true, guardianId: true, teacherProfileId: true, closedAt: true },
  });
  if (!thread) throw new MessageError("That conversation was not found");
  if (thread.closedAt) throw new MessageError("That conversation has been closed");

  const ownsIt =
    input.senderSide === "GUARDIAN"
      ? input.guardianId != null && thread.guardianId === input.guardianId
      : thread.teacherProfileId == null ||
        (input.teacherProfileId != null && thread.teacherProfileId === input.teacherProfileId);
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
    // Scoped to the company on purpose: an id from another tenant would
    // otherwise attach a stranger to a family's conversation.
    const staff = await prisma.schoolTeacherProfile.findFirst({
      where: { id: input.teacherProfileId, companyId: input.companyId },
      select: { id: true },
    });
    if (!staff) throw new MessageError("That member of staff was not found");
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
