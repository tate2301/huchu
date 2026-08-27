/**
 * Health, allergy and consent records.
 *
 * The rules that matter are about provenance — a consent with nobody's name
 * against it is not a consent — and they are CHECK constraints as well as
 * application checks, so the MIGRATION WITNESS tests insert past the service.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  anyConsentGiven,
  classHealthList,
  healthGaps,
  HealthRecordError,
  recordHealthEvent,
  saveHealthRecord,
} from "./health";

let companyId: string;
let classId: string;
let studentId: string;
let otherStudentId: string;

let counter = 0;
async function makeStudent(isBoarding = false) {
  counter += 1;
  const student = await prisma.schoolStudent.create({
    data: {
      companyId,
      studentNo: `H${String(counter).padStart(4, "0")}`,
      firstName: `Child${counter}`,
      lastName: `Welfare${counter}`,
      status: "ACTIVE",
      isBoarding,
      currentClassId: classId,
    },
    select: { id: true },
  });
  return student.id;
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Health Test ${stamp}`, slug: `health-test-${stamp}` },
  });
  companyId = company.id;
  classId = (
    await prisma.schoolClass.create({
      data: { companyId, code: "F1", name: "Form 1", level: 1 },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.schoolHealthEvent.deleteMany({ where: { companyId } });
  await prisma.schoolHealthRecord.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
  studentId = await makeStudent(true);
  otherStudentId = await makeStudent(false);
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("healthGaps", () => {
  it("says so when there is no record at all", () => {
    expect(healthGaps(null)).toEqual(["Nothing recorded at all"]);
  });

  it("calls out an allergy with no consent to treat", () => {
    // The specific combination a boarding school cannot live with.
    const gaps = healthGaps({
      allergies: "Peanuts",
      consentEmergencyTreatment: false,
      consentFirstAid: true,
      doctorPhone: "+263771000000",
    });
    expect(gaps.join(" ")).toContain("Allergy on file, no consent to treat");
  });

  it("is empty when everything a nurse needs is there", () => {
    expect(
      healthGaps({
        allergies: "Peanuts",
        consentEmergencyTreatment: true,
        consentFirstAid: true,
        doctorPhone: "+263771000000",
      }),
    ).toEqual([]);
  });
});

describe("anyConsentGiven", () => {
  it("is false for an untouched record and true for any single yes", () => {
    expect(anyConsentGiven({})).toBe(false);
    expect(anyConsentGiven({ consentPhotography: true })).toBe(true);
  });
});

describe("saveHealthRecord", () => {
  it("creates the record on first save rather than needing a New button", async () => {
    const saved = await saveHealthRecord({
      companyId,
      studentId,
      values: { allergies: "Peanuts — carries an EpiPen in her bag" },
    });
    expect(saved.studentId).toBe(studentId);

    const record = await prisma.schoolHealthRecord.findUniqueOrThrow({
      where: { studentId },
    });
    expect(record.allergies).toContain("EpiPen");
  });

  it("refuses a consent with nobody's name against it, with a sentence", async () => {
    await expect(
      saveHealthRecord({
        companyId,
        studentId,
        values: { consentEmergencyTreatment: true },
      }),
    ).rejects.toThrow(/who gave consent/i);
  });

  it("stamps the consent date on the server rather than taking it from a caller", async () => {
    // The field a school is asked to produce afterwards. A date from the client
    // is a date somebody can back-date.
    const before = Date.now();
    const saved = await saveHealthRecord({
      companyId,
      studentId,
      values: { consentEmergencyTreatment: true, consentGivenBy: "R. Chirwa (mother)" },
    });
    expect(saved.consentGivenAt).not.toBeNull();
    expect(saved.consentGivenAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("keeps the original consent date when the same person saves again", async () => {
    const first = await saveHealthRecord({
      companyId,
      studentId,
      values: { consentFirstAid: true, consentGivenBy: "R. Chirwa" },
    });
    const second = await saveHealthRecord({
      companyId,
      studentId,
      values: { allergies: "Bee stings" },
    });
    expect(second.consentGivenAt).toEqual(first.consentGivenAt);
  });

  it("clears the date when every consent is withdrawn", async () => {
    await saveHealthRecord({
      companyId,
      studentId,
      values: { consentFirstAid: true, consentGivenBy: "R. Chirwa" },
    });
    const withdrawn = await saveHealthRecord({
      companyId,
      studentId,
      values: { consentFirstAid: false, consentGivenBy: null },
    });
    expect(withdrawn.consentGivenAt).toBeNull();
  });

  it("refuses a second record for one child — MIGRATION WITNESS", async () => {
    await prisma.schoolHealthRecord.create({ data: { companyId, studentId } });
    await expect(
      prisma.schoolHealthRecord.create({ data: { companyId, studentId } }),
    ).rejects.toThrow();
  });

  it("refuses a consent with no giver — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolHealthRecord.create({
        data: { companyId, studentId, consentOutings: true },
      }),
    ).rejects.toThrow();
  });

  it("refuses a giver with no date — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolHealthRecord.create({
        data: { companyId, studentId, consentGivenBy: "Somebody" },
      }),
    ).rejects.toThrow();
  });
});

describe("recordHealthEvent", () => {
  it("creates the standing record if there is not one yet", async () => {
    // A child arriving at the sanatorium is not a moment to be told to fill in
    // a form first.
    const event = await recordHealthEvent({
      companyId,
      studentId,
      kind: "SANATORIUM_VISIT",
      summary: "Headache after games",
    });
    expect(event.kind).toBe("SANATORIUM_VISIT");
    expect(
      await prisma.schoolHealthRecord.count({ where: { studentId } }),
    ).toBe(1);
  });

  it("keeps every dose rather than only the latest", async () => {
    // "When did she last have paracetamol" has a wrong answer if only the
    // newest is kept.
    for (const hour of [8, 14, 20]) {
      await recordHealthEvent({
        companyId,
        studentId,
        kind: "MEDICATION",
        summary: "Paracetamol 500mg",
        occurredAt: new Date(`2026-08-04T${String(hour).padStart(2, "0")}:00:00Z`),
      });
    }
    expect(await prisma.schoolHealthEvent.count({ where: { studentId } })).toBe(3);
  });

  it("records whether home was told", async () => {
    const event = await recordHealthEvent({
      companyId,
      studentId,
      kind: "INJURY",
      summary: "Cut knee on the netball court",
      treatment: "Cleaned and dressed",
      guardianNotified: true,
    });
    const row = await prisma.schoolHealthEvent.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(row.guardianNotified).toBe(true);
  });

  it("refuses a child from another school", async () => {
    const other = await prisma.company.create({
      data: { name: `Elsewhere ${Date.now()}`, slug: `elsewhere-${Date.now()}` },
    });
    const stranger = await prisma.schoolStudent.create({
      data: {
        companyId: other.id,
        studentNo: "X001",
        firstName: "Not",
        lastName: "Ours",
      },
    });
    await expect(
      recordHealthEvent({
        companyId,
        studentId: stranger.id,
        kind: "INJURY",
        summary: "Nope",
      }),
    ).rejects.toThrow(HealthRecordError);
    await prisma.company.delete({ where: { id: other.id } }).catch(() => undefined);
  });
});

describe("classHealthList", () => {
  it("lists a child with no record at all rather than leaving them out", async () => {
    // Built from the students outward. A list of health records cannot show you
    // the child who has none, which is the one somebody has to chase.
    const list = await classHealthList({ companyId, classId });
    expect(list).toHaveLength(2);
    expect(list[0].record).toBeNull();
    expect(list[0].gaps).toEqual(["Nothing recorded at all"]);
  });

  it("narrows to boarders when asked", async () => {
    const list = await classHealthList({ companyId, boardingOnly: true });
    expect(list).toHaveLength(1);
    expect(list[0].student.id).toBe(studentId);
  });

  it("reports what is still missing on a partly-filled record", async () => {
    await saveHealthRecord({
      companyId,
      studentId: otherStudentId,
      values: {
        allergies: "Penicillin",
        consentFirstAid: true,
        consentGivenBy: "Guardian",
      },
    });
    const list = await classHealthList({ companyId, classId });
    const row = list.find((entry) => entry.student.id === otherStudentId);
    expect(row?.gaps.join(" ")).toContain("No consent recorded");
  });
});
