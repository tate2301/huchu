import { describe, it, expect, vi } from "vitest";

import { searchSchools, SCHOOL_SEARCH_TYPES } from "./search";

/**
 * S-4.5 — the school's arm of global search.
 *
 * Driven against a fake client rather than a database because what is worth
 * asserting here is the *query* and the *row*: which arms run, what the where
 * clause asks for, and what a result says once it comes back. A seeded Postgres
 * would prove Prisma works.
 */

type Row = Record<string, unknown>;

function fakeDb(rows: Partial<Record<string, Row[]>> = {}) {
  const calls: Record<string, unknown[]> = {};
  const arm = (name: string) =>
    vi.fn(async (args: unknown) => {
      calls[name] = [...(calls[name] ?? []), args];
      return rows[name] ?? [];
    });

  const db = {
    schoolStudent: { findMany: arm("schoolStudent") },
    schoolGuardian: { findMany: arm("schoolGuardian") },
    schoolTeacherProfile: { findMany: arm("schoolTeacherProfile") },
    schoolClass: { findMany: arm("schoolClass") },
    schoolSubject: { findMany: arm("schoolSubject") },
    schoolHostel: { findMany: arm("schoolHostel") },
  };

  return { db: db as never, calls };
}

const STUDENT = {
  id: "11111111-1111-4111-8111-111111111111",
  studentNo: "S1002",
  admissionNo: null,
  firstName: "Tendai",
  lastName: "Moyo",
  status: "ACTIVE",
  isBoarding: false,
  currentClass: { name: "Form 2 Blue" },
  currentStream: { name: "Blue" },
  guardianLinks: [
    {
      relationship: "MOTHER",
      guardian: { firstName: "Rudo", lastName: "Moyo", phone: "0772000111" },
    },
  ],
};

describe("searchSchools", () => {
  it("runs only the arms the caller is entitled to", async () => {
    const { db, calls } = fakeDb();

    await searchSchools(db, {
      companyId: "c1",
      query: "moyo",
      types: ["STUDENT", "CLASS"],
    });

    expect(Object.keys(calls).sort()).toEqual(["schoolClass", "schoolStudent"]);
    // Not "returned nothing": an unentitled arm must not be asked at all, so it
    // cannot leak through a count or a timing difference.
    expect(calls.schoolGuardian).toBeUndefined();
    expect(calls.schoolHostel).toBeUndefined();
  });

  it("searches nothing when no arm is allowed", async () => {
    const { db, calls } = fakeDb();
    const results = await searchSchools(db, { companyId: "c1", query: "moyo", types: [] });
    expect(results).toEqual([]);
    expect(Object.keys(calls)).toEqual([]);
  });

  it("matches a full name across the two name columns, in either order", async () => {
    const { db, calls } = fakeDb();

    await searchSchools(db, {
      companyId: "c1",
      query: "moyo tendai",
      types: ["STUDENT"],
    });

    const where = (calls.schoolStudent[0] as { where: { OR: Array<{ AND?: unknown[] }> } }).where;
    const nameClause = where.OR.find((clause) => clause.AND)?.AND;

    // One AND term per word, each an OR over firstName/lastName. This is what
    // makes "moyo tendai" find Tendai Moyo — the first thing anybody types, and
    // a query against either column alone finds nothing.
    expect(nameClause).toEqual([
      {
        OR: [
          { firstName: { contains: "moyo", mode: "insensitive" } },
          { lastName: { contains: "moyo", mode: "insensitive" } },
        ],
      },
      {
        OR: [
          { firstName: { contains: "tendai", mode: "insensitive" } },
          { lastName: { contains: "tendai", mode: "insensitive" } },
        ],
      },
    ]);
  });

  it("still matches a student number, which is not a name", async () => {
    const { db, calls } = fakeDb();
    await searchSchools(db, { companyId: "c1", query: "S1002", types: ["STUDENT"] });
    const where = (calls.schoolStudent[0] as { where: { OR: Row[] } }).where;
    expect(where.OR).toContainEqual({ studentNo: { contains: "S1002", mode: "insensitive" } });
  });

  it("scopes every arm to the tenant", async () => {
    const { db, calls } = fakeDb();
    await searchSchools(db, {
      companyId: "tenant-1",
      query: "form",
      types: SCHOOL_SEARCH_TYPES,
    });

    for (const arm of Object.values(calls)) {
      expect((arm[0] as { where: { companyId: string } }).where.companyId).toBe("tenant-1");
    }
  });

  it("tells two pupils of the same name apart on the row", async () => {
    const { db } = fakeDb({ schoolStudent: [STUDENT] });
    const [result] = await searchSchools(db, {
      companyId: "c1",
      query: "tendai",
      types: ["STUDENT"],
    });

    expect(result.title).toBe("Tendai Moyo");
    expect(result.reference).toBe("S1002");
    // The class is what distinguishes them, so it is on the row rather than left
    // to the record page.
    expect(result.subtitle).toBe("Form 2 Blue · Blue");
    expect(result.href).toBe(`/schools/students/${STUDENT.id}`);
  });

  it("keeps the ordinary status off the row and an unusual one on it", async () => {
    const { db } = fakeDb({ schoolStudent: [STUDENT] });
    const [active] = await searchSchools(db, {
      companyId: "c1",
      query: "tendai",
      types: ["STUDENT"],
    });
    expect(active.subtitle).not.toContain("active");

    const withdrawn = fakeDb({ schoolStudent: [{ ...STUDENT, status: "WITHDRAWN" }] });
    const [gone] = await searchSchools(withdrawn.db, {
      companyId: "c1",
      query: "tendai",
      types: ["STUDENT"],
    });
    expect(gone.subtitle).toContain("withdrawn");
  });

  it("names the family in the preview, with the relationship as its label", async () => {
    const { db } = fakeDb({ schoolStudent: [STUDENT] });
    const [result] = await searchSchools(db, {
      companyId: "c1",
      query: "tendai",
      types: ["STUDENT"],
    });

    expect(result.facts).toContainEqual({ label: "mother", value: "Rudo Moyo" });
    expect(result.facts).toContainEqual({ label: "Guardian phone", value: "0772000111" });
  });

  it("counts children as children rather than as childs", async () => {
    const { db } = fakeDb({
      schoolGuardian: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          guardianNo: "G0007",
          firstName: "Rudo",
          lastName: "Moyo",
          phone: "0772000111",
          email: null,
          studentLinks: [{ student: { firstName: "Tendai", lastName: "Moyo" } }],
          _count: { studentLinks: 3 },
        },
      ],
    });

    const [result] = await searchSchools(db, {
      companyId: "c1",
      query: "rudo",
      types: ["GUARDIAN"],
    });

    expect(result.subtitle).toBe("0772000111 · 3 children");
    expect(result.facts).toContainEqual({ label: "First child", value: "Tendai Moyo" });
  });

  it("reads a class against its capacity, which is the admission decision", async () => {
    const { db } = fakeDb({
      schoolClass: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          code: "F2B",
          name: "Form 2 Blue",
          level: 2,
          capacity: 30,
          term: { name: "Term 2" },
          _count: { students: 28 },
        },
      ],
    });

    const [result] = await searchSchools(db, {
      companyId: "c1",
      query: "form 2",
      types: ["CLASS"],
    });

    expect(result.subtitle).toBe("Term 2 · 28 of 30");
  });

  it("counts a class as classes", async () => {
    const { db } = fakeDb({
      schoolSubject: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          code: "MAT",
          name: "Mathematics",
          isCore: true,
          isActive: true,
          _count: { classSubjects: 4 },
        },
      ],
    });

    const [result] = await searchSchools(db, {
      companyId: "c1",
      query: "math",
      types: ["SUBJECT"],
    });

    expect(result.subtitle).toBe("Core · 4 classes");
    expect(result.href).toBe("/management/master-data/schools/subjects/44444444-4444-4444-8444-444444444444");
  });

  it("refuses a query too short to mean anything", async () => {
    const { db, calls } = fakeDb();
    expect(await searchSchools(db, { companyId: "c1", query: "a", types: ["STUDENT"] })).toEqual([]);
    expect(Object.keys(calls)).toEqual([]);
  });
});
