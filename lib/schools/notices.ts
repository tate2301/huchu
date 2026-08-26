import { prisma } from "@/lib/prisma";

/**
 * A school notice: the office speaking to its families and staff.
 *
 * The portals have read a notice board since S-6.x — the parent's News tab and
 * the pupil's Messages screen both render `NotificationRecipient` rows — but
 * nothing could write one. `NotificationType` carried fifty-four values for
 * payroll, permits, leads and gold and not one a school could send, so the
 * board was structurally unfeedable: a parent's News tab could only ever show
 * whatever the fee and assessment code happened to emit.
 *
 * Addressed, then written. The audience is the first decision the office makes
 * — "the Form 2 parents", not "everybody, filtered later" — so it is part of
 * the notice's type rather than a query applied at read time. That also means
 * a notice cannot silently widen after the fact: the recipient rows are fixed
 * when it is sent, and a pupil who joins tomorrow does not retroactively
 * receive yesterday's letter.
 */

export class NoticeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoticeError";
  }
}

export type NoticeAudience = "ALL" | "PARENTS" | "STUDENTS" | "TEACHERS";

const TYPE_FOR: Record<NoticeAudience, "SCHOOL_NOTICE_ALL" | "SCHOOL_NOTICE_PARENTS" | "SCHOOL_NOTICE_STUDENTS" | "SCHOOL_NOTICE_TEACHERS"> = {
  ALL: "SCHOOL_NOTICE_ALL",
  PARENTS: "SCHOOL_NOTICE_PARENTS",
  STUDENTS: "SCHOOL_NOTICE_STUDENTS",
  TEACHERS: "SCHOOL_NOTICE_TEACHERS",
};

/**
 * Who a notice reaches, as user ids.
 *
 * Only people with a portal account can be a recipient: a guardian the school
 * has never invited has no `userId`, and a row pointing at nobody is a
 * recipient count that lies about how many families were actually told.
 * They are counted separately instead, so the office can see that the notice
 * reached 40 of 58 families and go and invite the rest.
 */
export async function resolveNoticeAudience(input: {
  companyId: string;
  audience: NoticeAudience;
  /** Narrow to one year group. Parents means "parents of pupils in it". */
  classId?: string | null;
  /**
   * Narrow to a named set of pupils — the families a screen has already
   * shortlisted.
   *
   * The arrears board names the 188 who owe and the meetings board names the
   * one family whose slot was just released; neither is a year group, and
   * writing to the whole of Form 4 because six of them are behind is how a
   * school teaches its parents to stop reading the notice board. Teachers are
   * unaffected by it: a shortlist of pupils does not describe a staff room.
   */
  studentIds?: string[] | null;
}): Promise<{ userIds: string[]; withoutAccount: number }> {
  const { companyId, audience } = input;
  const classId = input.classId ?? null;
  const studentIds = input.studentIds?.length ? input.studentIds : null;

  const wantsParents = audience === "ALL" || audience === "PARENTS";
  const wantsStudents = audience === "ALL" || audience === "STUDENTS";
  const wantsTeachers = audience === "ALL" || audience === "TEACHERS";

  const userIds = new Set<string>();
  let withoutAccount = 0;

  if (wantsParents) {
    const links = await prisma.schoolStudentGuardian.findMany({
      where: {
        companyId,
        ...(studentIds ? { studentId: { in: studentIds } } : {}),
        student: {
          status: "ACTIVE",
          ...(classId ? { currentClassId: classId } : {}),
        },
      },
      select: { guardian: { select: { id: true, userId: true } } },
    });
    // A guardian with three children in the school is one person to write to.
    const seen = new Set<string>();
    for (const link of links) {
      if (seen.has(link.guardian.id)) continue;
      seen.add(link.guardian.id);
      if (link.guardian.userId) userIds.add(link.guardian.userId);
      else withoutAccount += 1;
    }
  }

  if (wantsStudents) {
    const students = await prisma.schoolStudent.findMany({
      where: {
        companyId,
        status: "ACTIVE",
        ...(classId ? { currentClassId: classId } : {}),
        ...(studentIds ? { id: { in: studentIds } } : {}),
      },
      select: { userId: true },
    });
    for (const student of students) {
      if (student.userId) userIds.add(student.userId);
      else withoutAccount += 1;
    }
  }

  if (wantsTeachers) {
    // A class-narrowed notice to teachers means the people who teach it.
    // `userId` is required on a teacher profile — a teacher *is* a user — so
    // unlike guardians and pupils there is nobody here without an account.
    const teachers = await prisma.schoolTeacherProfile.findMany({
      where: {
        companyId,
        ...(classId ? { assignments: { some: { classId, isActive: true } } } : {}),
      },
      select: { userId: true },
    });
    for (const teacher of teachers) userIds.add(teacher.userId);
  }

  return { userIds: [...userIds], withoutAccount };
}

export async function sendSchoolNotice(input: {
  companyId: string;
  senderUserId: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  classId?: string | null;
  /** A shortlist of pupils to write to the families of. See `resolveNoticeAudience`. */
  studentIds?: string[] | null;
  severity?: "INFO" | "WARNING" | "CRITICAL";
  /** After this, the notice stops showing. Null means it stands until archived. */
  expiresAt?: Date | null;
  /**
   * The notice this one puts right.
   *
   * A notice cannot be recalled — the recipient rows are written when it is
   * sent and the portals have already shown it — so the only honest correction
   * is a second notice to the same people that says what changed. Recording
   * which notice it corrects keeps the pair readable afterwards; without it the
   * sent list is two unrelated letters about the same sports day.
   */
  correctsNoticeId?: string | null;
}): Promise<{ id: string; recipients: number; withoutAccount: number }> {
  const { userIds, withoutAccount } = await resolveNoticeAudience({
    companyId: input.companyId,
    audience: input.audience,
    classId: input.classId ?? null,
    studentIds: input.studentIds ?? null,
  });

  if (userIds.length === 0) {
    throw new NoticeError(
      withoutAccount > 0
        ? `Nobody in that audience has a portal account yet — ${withoutAccount} ${withoutAccount === 1 ? "person has" : "people have"} not been invited.`
        : "There is nobody in that audience to write to.",
    );
  }

  // One transaction: a notice whose recipient rows half-wrote is a notice some
  // families got and others never will, with nothing on screen to say so.
  const notification = await prisma.$transaction(async (tx) => {
    const created = await tx.notification.create({
      data: {
        companyId: input.companyId,
        type: TYPE_FOR[input.audience],
        title: input.title,
        summary: input.body,
        severity: input.severity ?? "INFO",
        expiresAt: input.expiresAt ?? null,
        payloadJson: JSON.stringify({
          sentBy: input.senderUserId,
          classId: input.classId ?? null,
          // The ids themselves, not just a count: a bursar asked "who did that
          // reminder actually go to" a week later needs an answer, and the
          // recipient rows only name guardians who had an account.
          studentIds: input.studentIds ?? null,
          withoutAccount,
          correctsNoticeId: input.correctsNoticeId ?? null,
        }),
      },
      select: { id: true },
    });

    await tx.notificationRecipient.createMany({
      data: userIds.map((userId) => ({ notificationId: created.id, userId })),
    });

    return created;
  });

  return { id: notification.id, recipients: userIds.length, withoutAccount };
}

export type SentNotice = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  audience: string;
  /**
   * The audience as it was chosen, not as it is written down. The office's list
   * filters by it, and a correction has to be addressed to exactly the same
   * people — neither can work off a display label that says "Pupils".
   */
  audienceCode: NoticeAudience;
  /** The year group it was narrowed to, from the payload. Null means school-wide. */
  classId: string | null;
  className: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  recipients: number;
  read: number;
};

const AUDIENCE_FOR: Record<string, NoticeAudience> = {
  SCHOOL_NOTICE_ALL: "ALL",
  SCHOOL_NOTICE_PARENTS: "PARENTS",
  SCHOOL_NOTICE_STUDENTS: "STUDENTS",
  SCHOOL_NOTICE_TEACHERS: "TEACHERS",
};

/** The year group a notice was addressed to, if the sender narrowed it. */
function classIdFromPayload(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && "classId" in parsed) {
      const value = (parsed as { classId?: unknown }).classId;
      return typeof value === "string" ? value : null;
    }
  } catch {
    // A payload that will not parse is a notice sent by something else. It is
    // still a notice; it simply has no year group, which is what null says.
  }
  return null;
}

/** What the office has sent, with how far it got. */
export async function listSentNotices(input: {
  companyId: string;
  take?: number;
}): Promise<SentNotice[]> {
  const notices = await prisma.notification.findMany({
    where: {
      companyId: input.companyId,
      type: {
        in: [
          "SCHOOL_NOTICE_ALL",
          "SCHOOL_NOTICE_PARENTS",
          "SCHOOL_NOTICE_STUDENTS",
          "SCHOOL_NOTICE_TEACHERS",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: input.take ?? 100,
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      severity: true,
      createdAt: true,
      expiresAt: true,
      payloadJson: true,
      recipients: { select: { isRead: true } },
    },
  });

  // The year groups in one query rather than a join per notice: a term's worth
  // of notices names a handful of classes between them.
  const classIds = [
    ...new Set(
      notices
        .map((notice) => classIdFromPayload(notice.payloadJson))
        .filter((value): value is string => value !== null),
    ),
  ];
  const classes =
    classIds.length > 0
      ? await prisma.schoolClass.findMany({
          where: { companyId: input.companyId, id: { in: classIds } },
          select: { id: true, name: true },
        })
      : [];
  const classNames = new Map(classes.map((row) => [row.id, row.name]));

  return notices.map((notice) => {
    const classId = classIdFromPayload(notice.payloadJson);
    return {
      id: notice.id,
      title: notice.title,
      summary: notice.summary,
      severity: notice.severity,
      audience: audienceLabel(notice.type),
      audienceCode: AUDIENCE_FOR[notice.type] ?? "ALL",
      classId,
      className: classId ? (classNames.get(classId) ?? null) : null,
      createdAt: notice.createdAt,
      expiresAt: notice.expiresAt,
      recipients: notice.recipients.length,
      // "Read by 12 of 58" is the only honest measure of whether a notice landed.
      read: notice.recipients.filter((row) => row.isRead).length,
    };
  });
}

export function audienceLabel(type: string) {
  if (type.includes("PARENTS")) return "Parents";
  if (type.includes("STUDENTS")) return "Pupils";
  if (type.includes("TEACHERS")) return "Teachers";
  return "Everyone";
}
