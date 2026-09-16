import { prisma } from "@/lib/prisma";

/**
 * A class register, built from the roll rather than from what was recorded.
 *
 * Every pupil on the class list is a row whether or not anybody has marked
 * them, so an unmarked child is visible as unmarked instead of missing. The
 * same reasoning as the bed board and the homework board: an absence of a
 * record is the thing worth seeing.
 */

export type RegisterMark = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type RegisterRow = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  isBoarding: boolean;
  /** Null when nobody has marked this pupil for this date. */
  status: RegisterMark | null;
  remarks: string | null;
};

export class RegisterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterError";
  }
}

export type RegisterStatus = "DRAFT" | "SUBMITTED" | "LOCKED";

/**
 * The three states a register can be in, and what each one still allows.
 *
 * The rules were scattered across the four routes that touch a session and
 * disagreed with each other: the teacher's save refused only a locked day, the
 * office's submit demanded a draft, and the lock route wrote its own version of
 * both. A register a teacher cannot correct after sending it in is a phone call
 * to the office over a mis-tap, and a register nobody can send in at all is
 * what the parent app has been showing as "not yet submitted" every day of the
 * term. Those are decisions about one small state machine, so they are written
 * down once here and the routes ask.
 *
 * Each returns null when the act is allowed, or the sentence to refuse with —
 * the same shape as `schoolPermissionDenial`, and for the same reason: every
 * school route answers through `errorResponse`, so a thrown error would come
 * back as a 500.
 */

/**
 * Marking stops only at a locked day. A submitted register is still the
 * teacher's to correct, because the office has not yet made it the record.
 */
export function registerMarkDenial(status: RegisterStatus): string | null {
  if (status === "LOCKED") {
    return "The office has locked this register, so its marks can no longer be changed.";
  }
  return null;
}

/** Sending in happens once. A day already sent in, or locked, has nowhere to go. */
export function registerSubmitDenial(status: RegisterStatus): string | null {
  if (status === "SUBMITTED") return "This register has already been sent to the office.";
  if (status === "LOCKED") return "The office has locked this register.";
  return null;
}

/**
 * Locking is the office signing off a day the teacher has sent in, so there
 * has to be something to sign off: a draft is still being taken.
 */
export function registerLockDenial(status: RegisterStatus): string | null {
  if (status === "DRAFT") {
    return "This register has not been sent in yet, so there is nothing to lock.";
  }
  if (status === "LOCKED") return "This register is already locked.";
  return null;
}

/** Y-M-D midnight in UTC, matching how attendance dates are stored. */
export function attendanceDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function registerCounts(rows: RegisterRow[]) {
  return {
    present: rows.filter((row) => row.status === "PRESENT").length,
    absent: rows.filter((row) => row.status === "ABSENT").length,
    late: rows.filter((row) => row.status === "LATE").length,
    excused: rows.filter((row) => row.status === "EXCUSED").length,
    unmarked: rows.filter((row) => row.status === null).length,
  };
}

/**
 * The register for one lesson on one day.
 *
 * Keyed by the class-subject rather than by the class, because that is what a
 * teacher holds: the row in the timetable that says this teacher teaches this
 * subject to this class. It also carries the stream, so a subject taught to
 * one stream registers that stream and not the whole form.
 */
export async function classRegister(input: {
  companyId: string;
  classSubjectId: string;
  onDate: Date;
}) {
  const classSubject = await prisma.schoolClassSubject.findFirst({
    where: { id: input.classSubjectId, companyId: input.companyId },
    select: {
      id: true,
      termId: true,
      classId: true,
      streamId: true,
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      term: { select: { id: true, name: true } },
    },
  });
  if (!classSubject) throw new RegisterError("That class is not one of yours");

  const attendanceDate = attendanceDay(input.onDate);

  const [students, session] = await Promise.all([
    prisma.schoolStudent.findMany({
      where: {
        companyId: input.companyId,
        status: "ACTIVE",
        currentClassId: classSubject.classId,
        ...(classSubject.streamId ? { currentStreamId: classSubject.streamId } : {}),
      },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
        isBoarding: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.schoolAttendanceSession.findFirst({
      where: {
        companyId: input.companyId,
        termId: classSubject.termId,
        classId: classSubject.classId,
        streamId: classSubject.streamId,
        attendanceDate,
      },
      select: {
        id: true,
        status: true,
        notes: true,
        lines: { select: { studentId: true, status: true, remarks: true } },
      },
    }),
  ]);

  const marks = new Map(session?.lines.map((line) => [line.studentId, line]) ?? []);

  const rows: RegisterRow[] = students.map((student) => {
    const mark = marks.get(student.id);
    return {
      studentId: student.id,
      studentNo: student.studentNo,
      firstName: student.firstName,
      lastName: student.lastName,
      isBoarding: student.isBoarding,
      status: (mark?.status as RegisterMark | undefined) ?? null,
      remarks: mark?.remarks ?? null,
    };
  });

  return {
    classSubject: {
      id: classSubject.id,
      termId: classSubject.termId,
      classId: classSubject.classId,
      className: classSubject.class.name,
      classCode: classSubject.class.code,
      streamId: classSubject.streamId,
      streamName: classSubject.stream?.name ?? null,
      subjectName: classSubject.subject.name,
      subjectCode: classSubject.subject.code,
      termName: classSubject.term.name,
    },
    onDate: attendanceDate.toISOString().slice(0, 10),
    /**
     * The state machine answered here rather than in the screen. A register
     * with no session yet has been neither marked nor sent in, so the portal
     * treats a null session as both open to marks and ready to be sent.
     */
    session: session
      ? {
          id: session.id,
          status: session.status,
          notes: session.notes,
          canMark: registerMarkDenial(session.status) === null,
          canSubmit: registerSubmitDenial(session.status) === null,
        }
      : null,
    rows,
    counts: registerCounts(rows),
  };
}
