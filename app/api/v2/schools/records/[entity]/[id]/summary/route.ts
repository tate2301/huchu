import { NextRequest, NextResponse } from "next/server";

import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { recordSummaryPath, RECORD_ENTITIES, type RecordEntity } from "@/lib/crm/record-ref";
import { kept, money, type PeekSummary, type PeekTone } from "@/lib/records/peek-summary";
import { recordType, type SchoolRecordType } from "@/lib/records/registry";
import { rungName } from "@/lib/schools/class-stage";
import { schoolPermissionDenial, type SchoolResource } from "@/lib/schools/permissions";

/**
 * One campus record, small enough to look at without going there.
 *
 * The companion to `/api/v2/crm/records/[entity]/[id]/summary`, and deliberately
 * the same shape: the panel that draws these — `components/records/record-peek.tsx`
 * — is one component serving both modules, so a pupil and a deal arrive at it
 * looking alike. `PeekSummary` is shared for that reason and lives in
 * `lib/records/peek-summary.ts`.
 *
 * Why not the detail endpoints these types already have: a pupil's `GET` carries
 * every enrolment, every invoice, every boarding allocation and every result
 * line she has ever had. Reading all of that to draw four rows would make
 * glancing at a link cost more than opening the page.
 *
 * The properties are chosen the way a caption is chosen rather than the way a
 * table is: the four or five facts somebody hovering a name actually wants. For
 * a pupil that is her form room, who the school rings, where she sleeps and what
 * the family owes — not her id and not when the row was written.
 *
 * The guard is the detail endpoint's guard and nothing more, deliberately. It
 * is tempting to narrow a pupil's glance to the classes a teacher actually
 * teaches, the way `lib/schools/class-subject-access.ts` narrows the marks and
 * homework routes — but those routes are the only door to a class's academic
 * work, whereas this one summarises a page every teacher can already open:
 * `GET /api/v2/schools/students/:id` asks for `schools.students: view` and
 * stops there, and the roll lists every child in the school. A peek that
 * refused what the click beneath it allows would put two doors into the same
 * room and have them disagree, and the reader would learn only that the panel
 * is unreliable. If a teacher's reach into the roll should be narrower than it
 * is, that is a decision to take on the roll itself, where it would be visible,
 * rather than one to smuggle in through the preview.
 *
 * "No longer current" is said in exactly one place, the `archived` flag. A
 * teacher who has left, a house that is closed and a subject that is no longer
 * taught all come back archived rather than repeating the word in the subtitle
 * as well, and a record in that state still answers — it is reachable by every
 * link that was ever made to it, and a 404 would read as "deleted".
 */

const HERE = "/api/v2/schools/records/";

/**
 * The entities this route describes: the ones whose registry entry points their
 * summary at it. Derived rather than listed, for the reason the CRM route gives
 * at the same place — a second list of record types beside the registry is a
 * list that drifts from it.
 */
const SERVED: RecordEntity[] = RECORD_ENTITIES.filter((entity) =>
  recordSummaryPath({ entity, id: "-" })?.startsWith(HERE),
);

type SchoolEntity = Lowercase<SchoolRecordType>;

/**
 * What each type's own detail endpoint asks before it answers anything.
 *
 * A summary is the same read through a narrower door, so it asks the same
 * question: somebody refused `/api/v2/schools/teachers/:id` is refused the
 * glance at that teacher too, with the same status. Written as a total map over
 * the school record types so that a seventh cannot be registered without
 * somebody deciding whose permission covers it.
 */
const VIEW_GRANT: Record<SchoolEntity, SchoolResource> = {
  student: "schools.students",
  guardian: "schools.students",
  teacher: "schools.teachers",
  class: "schools.academics",
  subject: "schools.academics",
  hostel: "schools.boarding",
};

/**
 * The pupil states worth a badge.
 *
 * Only the ones that change what the reader does next. A green chip on every
 * child on the roll is a chip nobody reads — the same reason a colleague's peek
 * says nothing until they are no longer with us — and "left — withdrawn" is
 * said by the archived flag instead.
 */
const STUDENT_STATE: Partial<Record<string, { label: string; tone: PeekTone }>> = {
  APPLICANT: { label: "Applicant", tone: "info" },
  SUSPENDED: { label: "Suspended", tone: "warn" },
  GRADUATED: { label: "Left — completed", tone: "neutral" },
};

/** The school's words for a house's intake, as the hostel record page says them. */
const HOUSE_TAKES: Record<string, string> = {
  MIXED: "Mixed",
  MALE: "Boys",
  FEMALE: "Girls",
};

const line = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(" · ") || null;

/**
 * A handful of names, and how many were left out.
 *
 * A teacher takes nine classes and a guardian can have five children; a peek
 * has room for neither list in full, and a truncated list that does not admit
 * it is worse than no list.
 */
function andMore(names: string[], shown: number): string | null {
  if (names.length === 0) return null;
  const rest = names.length - shown;
  return rest > 0 ? `${names.slice(0, shown).join(" · ")} +${rest} more` : names.join(" · ");
}

/** Names in the order they were read, without the repeats. */
const distinct = (names: Array<string | null | undefined>): string[] => [
  ...new Set(names.filter((name): name is string => Boolean(name))),
];

const pageHref = (kind: SchoolEntity, id: string) =>
  recordType(kind.toUpperCase() as SchoolRecordType).href(id);

/**
 * Where a family stands, in the currencies the school billed in.
 *
 * Never converted and never totalled across currencies: a school invoicing in
 * two has no single meaningful figure, which is why the roll's fee column is a
 * word rather than a number. A peek is about one child, so it can afford the
 * figures — and the figure is the thing the office rings about.
 */
async function feesOutstanding(companyId: string, studentId: string): Promise<string | null> {
  const [billed, owing] = await Promise.all([
    prisma.schoolFeeInvoice.count({
      where: {
        companyId,
        studentId,
        // Drafts are not a bill yet and voided ones never were.
        status: { in: ["ISSUED", "PART_PAID", "PAID", "WRITEOFF"] },
      },
    }),
    prisma.schoolFeeInvoice.groupBy({
      by: ["currency"],
      where: {
        companyId,
        studentId,
        status: { in: ["ISSUED", "PART_PAID"] },
        balanceAmount: { gt: 0 },
      },
      _sum: { balanceAmount: true },
      _min: { dueDate: true },
    }),
  ]);

  if (billed === 0) return null;
  if (owing.length === 0) return "Paid up";

  const now = new Date();
  const overdue = owing.some((row) => row._min.dueDate != null && row._min.dueDate < now);
  const amounts = owing
    .map((row) => money(Number(row._sum.balanceAmount ?? 0), row.currency))
    .filter((amount): amount is string => Boolean(amount))
    .join(" · ");

  return overdue ? `${amounts} — overdue` : amounts;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { entity, id } = await params;

    if (!SERVED.includes(entity as RecordEntity)) {
      return errorResponse("Unknown record type", 400);
    }
    const kind = entity as SchoolEntity;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid record ID", 400);
    }

    const denied = schoolPermissionDenial(session, VIEW_GRANT[kind], "view");
    if (denied) return errorResponse(denied, 403);

    const companyId = session.user.companyId;

    if (kind === "student") {
      const student = await prisma.schoolStudent.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          status: true,
          currentClassId: true,
          currentStreamId: true,
          currentClass: { select: { name: true } },
          currentStream: { select: { name: true } },
          guardianLinks: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            take: 1,
            select: {
              guardian: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
          boardingAllocations: {
            where: { status: "ACTIVE" },
            orderBy: { startDate: "desc" },
            take: 1,
            select: { hostel: { select: { name: true } } },
          },
        },
      });
      if (!student) return errorResponse("Student not found", 404);

      const guardian = student.guardianLinks[0]?.guardian ?? null;
      const house = student.boardingAllocations[0]?.hostel?.name ?? null;

      return successResponse<PeekSummary>({
        entity: kind,
        id: student.id,
        href: pageHref(kind, student.id),
        title: `${student.firstName} ${student.lastName}`,
        reference: student.studentNo,
        status: STUDENT_STATE[student.status] ?? null,
        // The register class, which is what tells two children of the same name
        // apart on every screen in the module.
        subtitle: line([student.currentClass?.name, student.currentStream?.name]),
        properties: kept([
          {
            label: "Guardian",
            value: guardian ? `${guardian.firstName} ${guardian.lastName}` : null,
          },
          { label: "Guardian's phone", value: guardian?.phone },
          { label: "Fees", value: await feesOutstanding(companyId, student.id) },
          { label: "House", value: house },
        ]),
        archived: student.status === "WITHDRAWN",
      });
    }

    if (kind === "guardian") {
      const guardian = await prisma.schoolGuardian.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          guardianNo: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          address: true,
          studentLinks: {
            orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
            select: { student: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      if (!guardian) return errorResponse("Guardian not found", 404);

      const children = guardian.studentLinks.map(
        (link) => `${link.student.firstName} ${link.student.lastName}`,
      );

      return successResponse<PeekSummary>({
        entity: kind,
        id: guardian.id,
        href: pageHref(kind, guardian.id),
        title: `${guardian.firstName} ${guardian.lastName}`,
        reference: guardian.guardianNo,
        status: null,
        subtitle: line([
          guardian.phone,
          children.length === 1
            ? "1 child"
            : children.length
              ? `${children.length} children`
              : null,
        ]),
        properties: kept([
          { label: "Children", value: andMore(children, 3) },
          { label: "Email", value: guardian.email },
          { label: "Address", value: guardian.address },
        ]),
        archived: false,
      });
    }

    if (kind === "teacher") {
      const teacher = await prisma.schoolTeacherProfile.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          employeeCode: true,
          department: true,
          isClassTeacher: true,
          isHod: true,
          isActive: true,
          user: { select: { name: true, email: true, phone: true } },
          assignments: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
            select: {
              subject: { select: { name: true } },
              class: { select: { name: true } },
            },
          },
        },
      });
      if (!teacher) return errorResponse("Teacher not found", 404);

      return successResponse<PeekSummary>({
        entity: kind,
        id: teacher.id,
        href: pageHref(kind, teacher.id),
        title: teacher.user.name ?? teacher.user.email ?? "Member of staff",
        reference: teacher.employeeCode,
        status: null,
        subtitle: line([
          teacher.department,
          teacher.isHod ? "Head of department" : null,
          teacher.isClassTeacher ? "Form teacher" : null,
        ]),
        properties: kept([
          {
            label: "Teaches",
            value: andMore(distinct(teacher.assignments.map((row) => row.subject.name)), 3),
          },
          {
            label: "Classes",
            value: andMore(distinct(teacher.assignments.map((row) => row.class.name)), 3),
          },
          { label: "Email", value: teacher.user.email },
          { label: "Phone", value: teacher.user.phone },
        ]),
        archived: !teacher.isActive,
      });
    }

    if (kind === "class") {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          code: true,
          name: true,
          level: true,
          capacity: true,
          term: { select: { name: true } },
          _count: { select: { students: true, streams: true, classSubjects: true } },
        },
      });
      if (!schoolClass) return errorResponse("Class not found", 404);

      const onRoll = schoolClass._count.students;

      return successResponse<PeekSummary>({
        entity: kind,
        id: schoolClass.id,
        href: pageHref(kind, schoolClass.id),
        title: schoolClass.name,
        reference: schoolClass.code,
        status: null,
        // Against the roll rather than on its own: "28 of 30" is the number a
        // registrar decides an admission on.
        subtitle: line([
          schoolClass.term?.name,
          schoolClass.capacity == null
            ? `${onRoll} on the roll`
            : `${onRoll} of ${schoolClass.capacity}`,
        ]),
        properties: kept([
          {
            // Not the rung: a peek at Form 1 read "Year group 8".
            label: "Stage",
            value: rungName(schoolClass.level),
          },
          {
            label: "Streams",
            value: schoolClass._count.streams ? String(schoolClass._count.streams) : null,
          },
          {
            label: "Subjects",
            value: schoolClass._count.classSubjects
              ? String(schoolClass._count.classSubjects)
              : null,
          },
        ]),
        archived: false,
      });
    }

    if (kind === "subject") {
      const subject = await prisma.schoolSubject.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          code: true,
          name: true,
          isCore: true,
          passMark: true,
          isActive: true,
          classSubjects: {
            where: { isActive: true },
            orderBy: { createdAt: "asc" },
            select: {
              class: { select: { name: true } },
              teacherProfile: { select: { user: { select: { name: true } } } },
            },
          },
        },
      });
      if (!subject) return errorResponse("Subject not found", 404);

      return successResponse<PeekSummary>({
        entity: kind,
        id: subject.id,
        href: pageHref(kind, subject.id),
        title: subject.name,
        reference: subject.code,
        status: null,
        subtitle: line([
          subject.isCore ? "Core" : "Optional",
          subject.passMark == null ? null : `Pass at ${subject.passMark}`,
        ]),
        properties: kept([
          {
            label: "Taught to",
            value: andMore(distinct(subject.classSubjects.map((row) => row.class.name)), 3),
          },
          {
            label: "Taught by",
            value: andMore(
              distinct(subject.classSubjects.map((row) => row.teacherProfile.user.name)),
              3,
            ),
          },
        ]),
        archived: !subject.isActive,
      });
    }

    // A house, named rather than reached by falling off the end of the other
    // branches: a fall-through answers for whatever the guard let through, which
    // is the mistake the CRM summary route records at the same place.
    if (kind !== "hostel") return errorResponse("Unknown record type", 400);

    const hostel = await prisma.schoolHostel.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        code: true,
        name: true,
        genderPolicy: true,
        capacity: true,
        isActive: true,
        _count: { select: { rooms: true } },
      },
    });
    if (!hostel) return errorResponse("Hostel not found", 404);

    // Beds that exist and boarders actually in them — the two halves of the one
    // question a warden asks a house: is there room.
    const [beds, boarders] = await Promise.all([
      prisma.schoolHostelBed.count({ where: { companyId, hostelId: hostel.id, isActive: true } }),
      prisma.schoolBoardingAllocation.count({
        where: { companyId, hostelId: hostel.id, status: "ACTIVE" },
      }),
    ]);

    return successResponse<PeekSummary>({
      entity: "hostel",
      id: hostel.id,
      href: pageHref("hostel", hostel.id),
      title: hostel.name,
      reference: hostel.code,
      status: null,
      subtitle: line([HOUSE_TAKES[hostel.genderPolicy], `${boarders} of ${beds} beds`]),
      properties: kept([
        { label: "Rooms", value: hostel._count.rooms ? String(hostel._count.rooms) : null },
        { label: "Free beds", value: String(Math.max(0, beds - boarders)) },
        {
          label: "Intended capacity",
          value: hostel.capacity == null ? null : String(hostel.capacity),
        },
      ]),
      archived: !hostel.isActive,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/records/[entity]/[id]/summary error:", error);
    return errorResponse("Failed to load record", 500);
  }
}

