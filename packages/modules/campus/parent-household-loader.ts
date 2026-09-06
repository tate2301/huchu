import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import { resolvePortalGuardian } from "./portal-identity";
import { isoDayOfWeek } from "./teacher-day";
import { formatMinute } from "./timetable-format";

/**
 * What a parent's portal is about: their household.
 *
 * S-6.2/S-6.3. Read on the server, from the signed-in user, before the shell
 * paints — the same rule the student portal follows. A parent portal that fetched
 * its own identity would flash somebody else's empty state at whoever is holding
 * the phone, and a portal that took a child id from the URL would be a portal
 * where any parent could read any child by editing it.
 *
 * One load, every child, with the four figures a parent opens the app for: what is
 * owed, whether their child was in school, whether there are marks to read, and
 * whether the school has said anything. Per child rather than summed across the
 * household, because a parent with two children is asked for two different
 * amounts by two different classes and a single total answers neither.
 *
 * `canReceiveFinancials` and `canReceiveAcademicResults` are honoured HERE rather
 * than in the screens. A separated parent who may see attendance but not fees is a
 * real arrangement schools make, and a balance loaded "for the layout" is a
 * balance one query away from a screen that shows it.
 */

/**
 * One row of the child's day, for Home's TODAY section.
 *
 * Carried on the household rather than fetched by the screen because the whole
 * point of this loader is that Home paints rather than waits: a parent glancing
 * at "what is my child doing now" should not watch three skeletons resolve. Free
 * periods are not rows here — unlike the pupil's own timetable, a parent is
 * reading a summary of the day, and blank lines would pad it without saying
 * anything.
 */
export type ParentLesson = {
  periodId: string;
  /** "07:30". Wall clock, formatted on the server so the client never converts. */
  startsAt: string;
  endsAt: string;
  startMinute: number;
  subjectName: string;
  teacherName: string | null;
  roomName: string | null;
};

export type ParentChild = {
  id: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  status: string;
  isBoarding: boolean;
  avatarUrl: string | null;
  accent: string | null;
  relationship: string;
  isPrimary: boolean;
  /** What this guardian is allowed to be told. */
  canSeeFees: boolean;
  canSeeResults: boolean;
  currentClass: { id: string; code: string; name: string } | null;
  currentStream: { id: string; name: string } | null;
  /**
   * Null when this guardian may not see fees, so a screen cannot render it.
   *
   * `billed` and `paid` cover this term's bills whatever their state, so the
   * hero's progress bar reads "paid X of Y for the term" — a settled invoice is
   * part of what a family has paid, and leaving it out would show a bar that
   * slides backwards as the term is paid off.
   */
  fees: {
    currency: string;
    outstanding: string;
    overdue: string;
    invoices: number;
    billed: string;
    paid: string;
    /** The nearest unpaid due date, ISO, for the hero's "pay by" line. */
    nextDueDate: string | null;
  } | null;
  attendance: { present: number; absent: number; late: number; sessions: number };
  /** Whether there is anything published to read this term. */
  hasPublishedMarks: boolean;
  /** Today's lessons for this child's class, earliest first. Empty on a weekend. */
  today: ParentLesson[];
};

export type ParentHousehold = {
  guardian: {
    id: string;
    guardianNo: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  } | null;
  /** The school's own name, for Home's context line. */
  schoolName: string | null;
  term: {
    id: string;
    code: string;
    name: string;
    /**
     * Which week of the term today is, and how many the term runs.
     *
     * Computed here from the term's dates because "Week 6 of 13" is the line a
     * parent reads to place themselves in the term, and a client that worked it
     * out from two ISO strings would disagree with the office by a day either
     * side of midnight. Null before the term starts or after it ends.
     */
    weekNumber: number | null;
    weekCount: number;
  } | null;
  children: ParentChild[];
  /** School notices the household has not opened yet. */
  unreadNotices: number;
};

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Whole weeks between two dates, counting from 1 on the term's first day. */
function termWeeks(startDate: Date, endDate: Date, now: Date) {
  const span = endDate.getTime() - startDate.getTime();
  const weekCount = Math.max(1, Math.ceil(span / MS_PER_WEEK));
  const elapsed = now.getTime() - startDate.getTime();
  if (elapsed < 0 || now.getTime() > endDate.getTime()) {
    return { weekNumber: null, weekCount };
  }
  return { weekNumber: Math.min(weekCount, Math.floor(elapsed / MS_PER_WEEK) + 1), weekCount };
}

export async function loadParentHousehold(input: {
  companyId: string;
  userId: string;
  role?: string | null;
  /** Oversight only — a member of staff looking at a parent's view. */
  requestedGuardianId?: string | null;
}): Promise<ParentHousehold> {
  const { companyId } = input;

  const resolution = await resolvePortalGuardian(
    {
      companyId,
      userId: input.userId,
      role: input.role,
      requestedId: input.requestedGuardianId ?? null,
    },
    {
      select: {
        id: true,
        guardianNo: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
      },
    },
  );

  const guardian = resolution.kind === "forbidden" ? null : resolution.subject;
  const [activeTerm, company] = await Promise.all([
    prisma.schoolTerm.findFirst({
      where: { companyId, isActive: true },
      select: { id: true, code: true, name: true, startDate: true, endDate: true },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
  ]);

  const now = new Date();
  const term = activeTerm
    ? {
        id: activeTerm.id,
        code: activeTerm.code,
        name: activeTerm.name,
        ...termWeeks(activeTerm.startDate, activeTerm.endDate, now),
      }
    : null;
  const schoolName = company?.name ?? null;

  if (!guardian) {
    return { guardian: null, schoolName, term, children: [], unreadNotices: 0 };
  }

  // Notices reach a parent as notifications, which already carry read state per
  // recipient — so this is a real count rather than a badge that always shows.
  const unreadNotices = await prisma.notificationRecipient.count({
    where: { userId: input.userId, isRead: false, isArchived: false },
  });

  const links = await prisma.schoolStudentGuardian.findMany({
    where: { companyId, guardianId: guardian.id },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      relationship: true,
      isPrimary: true,
      canReceiveFinancials: true,
      canReceiveAcademicResults: true,
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          status: true,
          isBoarding: true,
          avatarUrl: true,
          accent: true,
          currentClass: { select: { id: true, code: true, name: true } },
          currentStream: { select: { id: true, name: true } },
        },
      },
    },
  });

  /**
   * The school's periods, once for the household rather than once per child.
   *
   * A period is a property of the school day, so two siblings at the same school
   * share them; fetching inside the per-child loop would run the same query
   * twice to get the same rows. Non-teaching periods are included so a break
   * between two lessons is not silently dropped from the times.
   */
  const dayOfWeek = isoDayOfWeek(now);
  const periods = term
    ? await prisma.schoolPeriod.findMany({
        where: {
          companyId,
          OR: [{ termId: term.id }, { termId: null }],
        },
        select: { id: true, startMinute: true, endMinute: true },
        orderBy: { sequence: "asc" },
      })
    : [];
  const periodById = new Map(periods.map((period) => [period.id, period]));

  const children = await Promise.all(
    links.map(async (link): Promise<ParentChild> => {
      const student = link.student;

      const [invoices, termInvoices, attendance, published, slots] = await Promise.all([
        link.canReceiveFinancials
          ? prisma.schoolFeeInvoice.findMany({
              where: {
                companyId,
                studentId: student.id,
                status: { in: ["ISSUED", "PART_PAID"] },
              },
              select: { currency: true, balanceAmount: true, dueDate: true },
            })
          : Promise.resolve(null),
        // This term's bills whatever their state, for "paid X of Y".
        link.canReceiveFinancials && term
          ? prisma.schoolFeeInvoice.findMany({
              where: {
                companyId,
                studentId: student.id,
                termId: term.id,
                status: { not: "DRAFT" },
              },
              select: { totalAmount: true, paidAmount: true },
            })
          : Promise.resolve([]),
        // This term's register, not all time: "was my child in school" is a
        // question about now, and a three-year total is a number nobody acts on.
        term
          ? prisma.schoolAttendanceSessionLine.groupBy({
              by: ["status"],
              where: {
                companyId,
                studentId: student.id,
                session: { termId: term.id },
              },
              _count: { _all: true },
            })
          : Promise.resolve([]),
        link.canReceiveAcademicResults && term
          ? prisma.schoolResultLine.count({
              where: {
                companyId,
                studentId: student.id,
                sheet: { termId: term.id, status: "PUBLISHED" },
              },
            })
          : Promise.resolve(0),
        // Today's lessons. Scoped to the child's own class and stream, and to
        // today's ISO day, so a Saturday is an empty day rather than Monday's.
        term && student.currentClass
          ? prisma.schoolTimetableSlot.findMany({
              where: {
                companyId,
                termId: term.id,
                classId: student.currentClass.id,
                dayOfWeek,
                ...(student.currentStream
                  ? { OR: [{ streamId: student.currentStream.id }, { streamId: null }] }
                  : {}),
              },
              select: {
                periodId: true,
                room: { select: { name: true } },
                classSubject: {
                  select: {
                    subject: { select: { name: true } },
                    teacherProfile: { select: { user: { select: { name: true } } } },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

      const today: ParentLesson[] = slots
        .flatMap((slot) => {
          const period = periodById.get(slot.periodId);
          if (!period) return [];
          return [
            {
              periodId: slot.periodId,
              startsAt: formatMinute(period.startMinute),
              endsAt: formatMinute(period.endMinute),
              startMinute: period.startMinute,
              subjectName: slot.classSubject.subject.name,
              teacherName: slot.classSubject.teacherProfile?.user?.name ?? null,
              roomName: slot.room?.name ?? null,
            },
          ];
        })
        .sort((a, b) => a.startMinute - b.startMinute);

      const counts = new Map(
        (attendance as Array<{ status: string; _count: { _all: number } }>).map((row) => [
          row.status,
          row._count._all,
        ]),
      );
      const sessions = [...counts.values()].reduce((sum, value) => sum + value, 0);

      const fees = invoices
        ? {
            currency: invoices[0]?.currency ?? "USD",
            // Strings, not numbers: this crosses a server/client boundary and a
            // balance that goes through a float on the way is a balance that can
            // print wrong. The screens format the string.
            outstanding: invoices
              .reduce((sum, invoice) => sum.plus(invoice.balanceAmount), new Prisma.Decimal(0))
              .toFixed(2),
            overdue: invoices
              .filter((invoice) => invoice.dueDate < now)
              .reduce((sum, invoice) => sum.plus(invoice.balanceAmount), new Prisma.Decimal(0))
              .toFixed(2),
            invoices: invoices.length,
            billed: termInvoices
              .reduce((sum, invoice) => sum.plus(invoice.totalAmount), new Prisma.Decimal(0))
              .toFixed(2),
            paid: termInvoices
              .reduce((sum, invoice) => sum.plus(invoice.paidAmount), new Prisma.Decimal(0))
              .toFixed(2),
            nextDueDate:
              [...invoices]
                .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
                ?.dueDate.toISOString() ?? null,
          }
        : null;

      return {
        id: student.id,
        studentNo: student.studentNo,
        firstName: student.firstName,
        lastName: student.lastName,
        status: student.status,
        isBoarding: student.isBoarding,
        avatarUrl: student.avatarUrl,
        accent: student.accent,
        relationship: link.relationship,
        isPrimary: link.isPrimary,
        canSeeFees: link.canReceiveFinancials,
        canSeeResults: link.canReceiveAcademicResults,
        currentClass: student.currentClass,
        currentStream: student.currentStream,
        fees,
        attendance: {
          present: counts.get("PRESENT") ?? 0,
          absent: counts.get("ABSENT") ?? 0,
          late: counts.get("LATE") ?? 0,
          sessions,
        },
        hasPublishedMarks: published > 0,
        today,
      };
    }),
  );

  return { guardian, schoolName, term, children, unreadNotices };
}
