/**
 * The school's arm of global search.
 *
 * S-4.5. One box that finds a pupil, a parent, a member of staff, a class, a
 * subject or a hostel — the same box, the same result shape and the same preview
 * pane the CRM uses, because the shape lives in
 * `lib/records/search-result.ts` and this file only knows about tables.
 *
 * Three decisions are worth reading.
 *
 * **A name is two columns here.** A CRM person has one `fullName`; a pupil has
 * `firstName` and `lastName`. Searching "Tendai Moyo" against either column
 * alone finds nothing, which is the first thing anybody types. So a
 * whitespace-separated query is split and each part has to match *some* name
 * column — "moyo tendai" works as well as "tendai moyo", and a single word still
 * matches either.
 *
 * **The links are the disambiguator.** Two pupils genuinely called Tendai Moyo
 * is normal in a Zimbabwean school of 900, and their class tells them apart;
 * nothing else on the row does. So the class and the stream are read for the
 * subtitle rather than left to the record page, and a guardian carries the name
 * of a child. That is one extra join per arm and it is the difference between a
 * result you can act on and one you have to open.
 *
 * **A child's name is not searched on the guardian arm.** A switchboard call
 * ("I'm ringing about Tendai") is answered by finding Tendai and reading the
 * guardians off the pupil's page — one hop, and it cannot return four parents
 * because four families have a Tendai. Widening the guardian arm to children's
 * names would make every common first name return the whole junior school.
 *
 * Destinations come from `lib/records/registry.ts` rather than being written out
 * again: S-4.3 already decided where a student record lives, and a second copy
 * of that answer is a broken link waiting for the first route change.
 */
import type { Prisma } from "@corelithzw/db";

import { recordType } from "@/lib/records/registry";
import {
  facts,
  pluralise,
  SEARCH_PER_TYPE_LIMIT,
  wordMatches,
  type SearchResult,
  type SearchResultType,
} from "@/lib/records/search-result";
import type { SchoolResource } from "@/lib/schools/permissions";

type Tx = Prisma.TransactionClient;

/** The school record types global search can return. */
export const SCHOOL_SEARCH_TYPES = [
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const;

export type SchoolSearchType = (typeof SCHOOL_SEARCH_TYPES)[number];

/**
 * Which feature each arm needs.
 *
 * Not one gate for the module: a school that has not bought boarding has no
 * hostels to find, and a tenant without `schools.teachers` should not have staff
 * surface through a search box when every list of them is switched off. The
 * caller resolves these and passes the arms that survive.
 */
export const SCHOOL_SEARCH_FEATURES: Record<SchoolSearchType, string> = {
  STUDENT: "schools.students",
  GUARDIAN: "schools.students",
  TEACHER: "schools.teachers",
  CLASS: "schools.core",
  SUBJECT: "schools.core",
  HOSTEL: "schools.boarding",
};

/** The resource each arm's role check is asked about, alongside the feature. */
export const SCHOOL_SEARCH_RESOURCES: Record<SchoolSearchType, SchoolResource> = {
  STUDENT: "schools.students",
  GUARDIAN: "schools.students",
  TEACHER: "schools.teachers",
  CLASS: "schools.academics",
  SUBJECT: "schools.academics",
  HOSTEL: "schools.boarding",
};

/**
 * A person's name across two columns.
 *
 * `firstName` and `lastName` rather than one `fullName`, which is the whole
 * reason the query has to be split; the splitting itself is
 * `wordMatches` in `lib/records/search-result.ts`, shared with the seven other
 * arms that need the same thing.
 */
const nameParts = wordMatches;

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

/** "1 child" / "3 children" — `pluralise` cannot help with an irregular plural. */
function children(count: number): string {
  return `${count} ${count === 1 ? "child" : "children"}`;
}

/** "1 class" / "4 classes" — likewise: the plural takes an -es. */
function classCount(count: number): string {
  return `${count} ${count === 1 ? "class" : "classes"}`;
}

export async function searchSchools(
  db: Tx,
  input: {
    companyId: string;
    query: string;
    limitPerType?: number;
    /** The arms the caller is entitled to run. Anything absent is not searched. */
    types: readonly SchoolSearchType[];
  },
): Promise<SearchResult[]> {
  const query = input.query.trim();
  if (query.length < 2) return [];

  const allowed = new Set<SearchResultType>(input.types);
  if (allowed.size === 0) return [];

  const take = input.limitPerType ?? SEARCH_PER_TYPE_LIMIT;
  const contains = { contains: query, mode: "insensitive" as const };
  const companyId = input.companyId;

  const [students, guardians, teachers, classes, subjects, hostels] = await Promise.all([
    allowed.has("STUDENT")
      ? db.schoolStudent.findMany({
          where: {
            companyId,
            OR: [
              { AND: nameParts(query, ["firstName", "lastName"]) },
              { studentNo: contains },
              { admissionNo: contains },
            ],
          },
          select: {
            id: true,
            studentNo: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            status: true,
            isBoarding: true,
            currentClass: { select: { name: true } },
            currentStream: { select: { name: true } },
            // One guardian, for the preview. Which family a child belongs to is
            // how an office tells two pupils of the same name apart when they
            // are in the same year.
            guardianLinks: {
              take: 1,
              orderBy: { isPrimary: "desc" },
              select: {
                relationship: true,
                guardian: { select: { firstName: true, lastName: true, phone: true } },
              },
            },
          },
          take,
        })
      : [],

    allowed.has("GUARDIAN")
      ? db.schoolGuardian.findMany({
          where: {
            companyId,
            OR: [
              { AND: nameParts(query, ["firstName", "lastName"]) },
              { guardianNo: contains },
              { phone: contains },
              { email: contains },
              { nationalId: contains },
            ],
          },
          select: {
            id: true,
            guardianNo: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            studentLinks: {
              take: 1,
              orderBy: { isPrimary: "desc" },
              select: { student: { select: { firstName: true, lastName: true } } },
            },
            _count: { select: { studentLinks: true } },
          },
          take,
        })
      : [],

    allowed.has("TEACHER")
      ? db.schoolTeacherProfile.findMany({
          where: {
            companyId,
            OR: [
              { employeeCode: contains },
              { department: contains },
              // The name and the email live on the `User` (S-1.7) — a teacher is
              // one person with two records, and this is the one people type.
              { user: { name: contains } },
              { user: { email: contains } },
            ],
          },
          select: {
            id: true,
            employeeCode: true,
            department: true,
            isHod: true,
            isActive: true,
            user: { select: { name: true, email: true } },
            _count: { select: { assignments: true } },
          },
          take,
        })
      : [],

    allowed.has("CLASS")
      ? db.schoolClass.findMany({
          where: { companyId, OR: [{ code: contains }, { name: contains }] },
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
            capacity: true,
            term: { select: { name: true } },
            _count: { select: { students: true } },
          },
          take,
        })
      : [],

    allowed.has("SUBJECT")
      ? db.schoolSubject.findMany({
          where: { companyId, OR: [{ code: contains }, { name: contains }] },
          select: {
            id: true,
            code: true,
            name: true,
            isCore: true,
            isActive: true,
            _count: { select: { classSubjects: true } },
          },
          take,
        })
      : [],

    allowed.has("HOSTEL")
      ? db.schoolHostel.findMany({
          where: { companyId, OR: [{ code: contains }, { name: contains }] },
          select: {
            id: true,
            code: true,
            name: true,
            genderPolicy: true,
            isActive: true,
            _count: { select: { allocations: true, beds: true } },
          },
          take,
        })
      : [],
  ]);

  const results: SearchResult[] = [];

  for (const student of students) {
    const name = fullName(student);
    const link = student.guardianLinks[0];
    const guardian = link?.guardian ? fullName(link.guardian) : null;
    const context = [
      student.currentClass?.name,
      student.currentStream?.name,
      // Only when it is not the ordinary case: an ACTIVE pupil saying "active"
      // on every row is noise, a WITHDRAWN one is the answer.
      student.status === "ACTIVE" ? null : student.status.toLowerCase(),
    ].filter(Boolean);

    results.push({
      type: "STUDENT",
      id: student.id,
      reference: student.studentNo,
      title: name,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Class", student.currentClass?.name],
        ["Stream", student.currentStream?.name],
        ["Status", student.status.toLowerCase()],
        ["Boarding", student.isBoarding ? "Boarder" : null],
        [link?.relationship ? link.relationship.toLowerCase() : "Guardian", guardian],
        ["Guardian phone", link?.guardian?.phone],
        ["Admission number", student.admissionNo],
      ]),
      href: recordType("STUDENT").href(student.id),
    });
  }

  for (const guardian of guardians) {
    const child = guardian.studentLinks[0]?.student;
    const context = [
      guardian.phone,
      guardian._count.studentLinks > 0 ? children(guardian._count.studentLinks) : null,
    ].filter(Boolean);

    results.push({
      type: "GUARDIAN",
      id: guardian.id,
      reference: guardian.guardianNo,
      title: fullName(guardian),
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Phone", guardian.phone],
        ["Email", guardian.email],
        ["Children", guardian._count.studentLinks || null],
        ["First child", child ? fullName(child) : null],
      ]),
      href: recordType("GUARDIAN").href(guardian.id),
    });
  }

  for (const teacher of teachers) {
    const name = teacher.user?.name ?? teacher.user?.email ?? teacher.employeeCode;
    const context = [
      teacher.department,
      teacher.isHod ? "Head of department" : null,
      teacher.isActive ? null : "not teaching",
    ].filter(Boolean);

    results.push({
      type: "TEACHER",
      id: teacher.id,
      reference: teacher.employeeCode,
      title: name,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Department", teacher.department],
        ["Role", teacher.isHod ? "Head of department" : "Teacher"],
        ["Email", teacher.user?.email],
        ["Timetabled", teacher._count.assignments || null],
        ["Status", teacher.isActive ? null : "Not teaching"],
      ]),
      href: recordType("TEACHER").href(teacher.id),
    });
  }

  for (const klass of classes) {
    const onRoll = klass._count.students;
    const context = [
      klass.term?.name,
      // Against the capacity when there is one: "28 of 30" is the number a
      // registrar is deciding an admission on.
      klass.capacity == null ? pluralise(onRoll, "pupil") : `${onRoll} of ${klass.capacity}`,
    ].filter(Boolean);

    results.push({
      type: "CLASS",
      id: klass.id,
      reference: klass.code,
      title: klass.name,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Term", klass.term?.name],
        ["Year group", klass.level],
        ["On the roll", onRoll],
        ["Places", klass.capacity],
      ]),
      href: recordType("CLASS").href(klass.id),
    });
  }

  for (const subject of subjects) {
    const context = [
      subject.isCore ? "Core" : "Optional",
      subject._count.classSubjects > 0 ? classCount(subject._count.classSubjects) : null,
      subject.isActive ? null : "not taught",
    ].filter(Boolean);

    results.push({
      type: "SUBJECT",
      id: subject.id,
      reference: subject.code,
      title: subject.name,
      subtitle: context.length > 0 ? context.join(" · ") : null,
      facts: facts([
        ["Taken by", subject.isCore ? "Everybody — core" : "Optional"],
        ["Classes", subject._count.classSubjects || null],
        ["Status", subject.isActive ? null : "Not taught"],
      ]),
      href: recordType("SUBJECT").href(subject.id),
    });
  }

  for (const hostel of hostels) {
    const occupied = hostel._count.allocations;
    const context = [
      hostel.genderPolicy === "MIXED" ? "Mixed" : hostel.genderPolicy.toLowerCase(),
      `${occupied} of ${hostel._count.beds} beds`,
      hostel.isActive ? null : "closed",
    ].filter(Boolean);

    results.push({
      type: "HOSTEL",
      id: hostel.id,
      reference: hostel.code,
      title: hostel.name,
      subtitle: context.join(" · "),
      facts: facts([
        ["Takes", hostel.genderPolicy === "MIXED" ? "Mixed" : hostel.genderPolicy.toLowerCase()],
        ["Boarders", occupied],
        ["Beds", hostel._count.beds],
        ["Status", hostel.isActive ? null : "Closed"],
      ]),
      href: recordType("HOSTEL").href(hostel.id),
    });
  }

  return results;
}
