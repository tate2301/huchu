/**
 * The admissions pipeline.
 *
 * The stage machine is application logic and tested as such; the invariants it
 * exists to protect are constraints in `20260804210000_school_applications`,
 * and the tests marked MIGRATION WITNESS insert past the service layer so that
 * dropping one fails a test rather than quietly widening the database.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migration applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  applicationPipelineCounts,
  canMoveTo,
  enrolApplicant,
  findDuplicateApplications,
  moveApplication,
  nextApplicationNo,
  offerHasLapsed,
  StageTransitionError,
  transitionRefusal,
} from "./admissions";

let companyId: string;
let termId: string;
let classId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

let sequence = 0;
async function makeApplication(overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return prisma.schoolApplication.create({
    data: {
      companyId,
      applicationNo: `APP-2026-${String(sequence).padStart(4, "0")}`,
      firstName: "Rudo",
      lastName: "Chirwa",
      appliedForClassId: classId,
      intendedTermId: termId,
      ...overrides,
    },
    select: { id: true, applicationNo: true, stage: true },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = Date.now();
  const company = await prisma.company.create({
    data: { name: `Admissions Test ${stamp}`, slug: `admissions-test-${stamp}` },
  });
  companyId = company.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: "2026",
      name: "2026",
      startDate: date("2026-01-01"),
      endDate: date("2026-12-31"),
    },
  });
  const term = await prisma.schoolTerm.create({
    data: {
      companyId,
      academicYearId: year.id,
      code: "T1",
      name: "Term 1",
      startDate: date("2026-01-08"),
      endDate: date("2026-04-10"),
      isActive: true,
    },
  });
  termId = term.id;

  const schoolClass = await prisma.schoolClass.create({
    data: { companyId, code: "F1", name: "Form 1", level: 8 },
  });
  classId = schoolClass.id;
});

beforeEach(async () => {
  await prisma.schoolApplicationEvent.deleteMany({ where: { companyId } });
  await prisma.schoolApplication.deleteMany({ where: { companyId } });
  await prisma.schoolEnrollment.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => undefined);
  await prisma.$disconnect();
});

describe("the stage machine", () => {
  it("walks the ordinary path", () => {
    expect(canMoveTo("ENQUIRY", "APPLIED")).toBe(true);
    expect(canMoveTo("APPLIED", "ASSESSMENT")).toBe(true);
    expect(canMoveTo("ASSESSMENT", "OFFERED")).toBe(true);
    expect(canMoveTo("OFFERED", "ACCEPTED")).toBe(true);
    expect(canMoveTo("ACCEPTED", "ENROLLED")).toBe(true);
  });

  it("refuses a jump from enquiry straight to an offer", () => {
    // Not because it never happens, but because it should leave a form behind.
    expect(canMoveTo("ENQUIRY", "OFFERED")).toBe(false);
    expect(transitionRefusal("ENQUIRY", "OFFERED")).toContain("Applied");
  });

  it("treats a child on the roll as the end of the line", () => {
    expect(transitionRefusal("ENROLLED", "WITHDRAWN")).toContain("student record");
  });

  it("lets a withdrawn family come back", () => {
    // Families change their minds twice. A second application would lose the
    // trail on the first.
    expect(canMoveTo("WITHDRAWN", "APPLIED")).toBe(true);
    expect(canMoveTo("DECLINED", "APPLIED")).toBe(true);
  });

  it("keeps the school saying no apart from the family walking away", () => {
    // Six rejections and six families choosing another school are different
    // problems with different fixes.
    expect(canMoveTo("OFFERED", "DECLINED")).toBe(true);
    expect(canMoveTo("OFFERED", "WITHDRAWN")).toBe(true);
  });

  it("knows when an offer has run out", () => {
    const offer = { stage: "OFFERED" as const, offerExpiresAt: date("2026-03-01") };
    expect(offerHasLapsed(offer, date("2026-03-02"))).toBe(true);
    expect(offerHasLapsed(offer, date("2026-02-28"))).toBe(false);
    expect(
      offerHasLapsed({ stage: "ACCEPTED", offerExpiresAt: date("2026-01-01") }, date("2026-06-01")),
    ).toBe(false);
  });
});

describe("nextApplicationNo", () => {
  it("starts at one and counts up", async () => {
    expect(await nextApplicationNo(companyId, 2026)).toBe("APP-2026-0001");
    await makeApplication({ applicationNo: "APP-2026-0001" });
    expect(await nextApplicationNo(companyId, 2026)).toBe("APP-2026-0002");
  });

  it("does not reissue the number of a withdrawn application", async () => {
    // Counting rows would hand APP-0002 to the next applicant and leave two
    // folders with the same label. Withdrawn is how an application ends, so
    // this is the case that matters.
    await makeApplication({ applicationNo: "APP-2026-0001" });
    const second = await makeApplication({ applicationNo: "APP-2026-0002" });
    await prisma.schoolApplication.update({
      where: { id: second.id },
      data: { stage: "WITHDRAWN" },
    });
    expect(await nextApplicationNo(companyId, 2026)).toBe("APP-2026-0003");
  });
});

describe("findDuplicateApplications", () => {
  it("reports the same name", async () => {
    await makeApplication({ firstName: "Rudo", lastName: "Chirwa" });
    const found = await findDuplicateApplications({
      companyId,
      firstName: "rudo",
      lastName: "CHIRWA",
    });
    expect(found).toHaveLength(1);
    expect(found[0].reason).toBe("Same name");
  });

  it("does not report the same name with a different birthday", async () => {
    // Two boys called Tendai Moyo in one intake is ordinary. Warning on it
    // trains the registrar to dismiss the warning.
    await makeApplication({
      firstName: "Tendai",
      lastName: "Moyo",
      dateOfBirth: date("2014-03-01"),
    });
    const found = await findDuplicateApplications({
      companyId,
      firstName: "Tendai",
      lastName: "Moyo",
      dateOfBirth: date("2015-09-12"),
    });
    expect(found).toHaveLength(0);
  });

  it("reports a shared guardian phone, which is usually a sibling", async () => {
    await makeApplication({
      firstName: "Anesu",
      lastName: "Banda",
      guardianPhone: "+263771234567",
    });
    const found = await findDuplicateApplications({
      companyId,
      firstName: "Tapiwa",
      lastName: "Banda",
      guardianPhone: "+263771234567",
    });
    expect(found).toHaveLength(1);
    expect(found[0].reason).toContain("phone");
  });

  it("excludes the application being edited", async () => {
    const application = await makeApplication();
    const found = await findDuplicateApplications({
      companyId,
      firstName: "Rudo",
      lastName: "Chirwa",
      excludeId: application.id,
    });
    expect(found).toHaveLength(0);
  });
});

describe("moveApplication", () => {
  it("records who moved it and from where", async () => {
    const application = await makeApplication({ stage: "APPLIED" });
    await moveApplication({
      companyId,
      applicationId: application.id,
      toStage: "ASSESSMENT",
      comment: "Sitting the entrance test on the 12th",
    });

    const events = await prisma.schoolApplicationEvent.findMany({
      where: { applicationId: application.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0].fromStage).toBe("APPLIED");
    expect(events[0].toStage).toBe("ASSESSMENT");
  });

  it("stamps an offer with its date and expiry", async () => {
    const application = await makeApplication({ stage: "APPLIED" });
    // A month out, relative to now — the offer is stamped with the wall clock,
    // so a fixed date in the past would be an expiry before the offer.
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await moveApplication({
      companyId,
      applicationId: application.id,
      toStage: "OFFERED",
      offerExpiresAt: expires,
    });
    const row = await prisma.schoolApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(row.offeredAt).not.toBeNull();
    expect(row.offerExpiresAt).toEqual(expires);
  });

  it("refuses an offer that would expire before it was made, with a sentence", async () => {
    // The database refuses it too, but as a constraint violation nobody can
    // act on. This is the message the registrar reads.
    const application = await makeApplication({ stage: "APPLIED" });
    await expect(
      moveApplication({
        companyId,
        applicationId: application.id,
        toStage: "OFFERED",
        offerExpiresAt: date("2020-01-01"),
      }),
    ).rejects.toThrow(/date in the future/i);
  });

  it("refuses a move the pipeline does not allow, with a reason", async () => {
    const application = await makeApplication({ stage: "ENQUIRY" });
    await expect(
      moveApplication({
        companyId,
        applicationId: application.id,
        toStage: "ACCEPTED",
      }),
    ).rejects.toThrow(StageTransitionError);
  });

  it("sends enrolment through the enrol action rather than a stage change", async () => {
    // Moving the stage alone would leave a place given to nobody, which the
    // database refuses anyway.
    const application = await makeApplication({ stage: "ACCEPTED" });
    await expect(
      moveApplication({
        companyId,
        applicationId: application.id,
        toStage: "ENROLLED",
      }),
    ).rejects.toThrow(/enrol action/i);
  });

  it("is a no-op when the stage is already the one asked for", async () => {
    const application = await makeApplication({ stage: "APPLIED" });
    const result = await moveApplication({
      companyId,
      applicationId: application.id,
      toStage: "APPLIED",
    });
    expect(result.unchanged).toBe(true);
    expect(
      await prisma.schoolApplicationEvent.count({
        where: { applicationId: application.id },
      }),
    ).toBe(0);
  });
});

describe("enrolApplicant", () => {
  it("creates the student, the enrolment, the stage and the trail together", async () => {
    const application = await makeApplication({ stage: "ACCEPTED" });
    const result = await enrolApplicant({
      companyId,
      applicationId: application.id,
      studentNo: "S2026-001",
      classId,
      termId,
    });

    const student = await prisma.schoolStudent.findUniqueOrThrow({
      where: { id: result.studentId },
    });
    expect(student.firstName).toBe("Rudo");
    expect(student.status).toBe("ACTIVE");
    expect(student.currentClassId).toBe(classId);

    expect(
      await prisma.schoolEnrollment.count({ where: { studentId: result.studentId } }),
    ).toBe(1);

    const row = await prisma.schoolApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(row.stage).toBe("ENROLLED");
    expect(row.studentId).toBe(result.studentId);
  });

  it("refuses to enrol an applicant who has not been accepted", async () => {
    const application = await makeApplication({ stage: "APPLIED" });
    await expect(
      enrolApplicant({
        companyId,
        applicationId: application.id,
        studentNo: "S2026-002",
        classId,
        termId,
      }),
    ).rejects.toThrow(/accepted/i);
  });

  it("leaves nothing behind when the enrolment fails half way", async () => {
    // A duplicate student number fails the insert. Without the transaction the
    // application would already say ENROLLED and point at nothing.
    await prisma.schoolStudent.create({
      data: { companyId, studentNo: "S2026-003", firstName: "A", lastName: "B" },
    });
    const application = await makeApplication({ stage: "ACCEPTED" });

    await expect(
      enrolApplicant({
        companyId,
        applicationId: application.id,
        studentNo: "S2026-003",
        classId,
        termId,
      }),
    ).rejects.toThrow();

    const row = await prisma.schoolApplication.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(row.stage).toBe("ACCEPTED");
    expect(row.studentId).toBeNull();
  });

  it("refuses to enrol the same applicant twice", async () => {
    const application = await makeApplication({ stage: "ACCEPTED" });
    await enrolApplicant({
      companyId,
      applicationId: application.id,
      studentNo: "S2026-004",
      classId,
      termId,
    });
    await expect(
      enrolApplicant({
        companyId,
        applicationId: application.id,
        studentNo: "S2026-005",
        classId,
        termId,
      }),
    ).rejects.toThrow(/already on the roll/i);
  });

  it("refuses ENROLLED with no student — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolApplication.create({
        data: {
          companyId,
          applicationNo: "APP-2026-9001",
          firstName: "Ghost",
          lastName: "Place",
          stage: "ENROLLED",
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses an offer that expires before it is made — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolApplication.create({
        data: {
          companyId,
          applicationNo: "APP-2026-9002",
          firstName: "Back",
          lastName: "Wards",
          offeredAt: date("2026-04-01"),
          offerExpiresAt: date("2026-03-01"),
        },
      }),
    ).rejects.toThrow();
  });

  it("refuses an entrance mark over 100 — MIGRATION WITNESS", async () => {
    await expect(
      prisma.schoolApplication.create({
        data: {
          companyId,
          applicationNo: "APP-2026-9003",
          firstName: "Over",
          lastName: "Achiever",
          assessmentScore: 140,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("applicationPipelineCounts", () => {
  it("counts each stage in one query", async () => {
    await makeApplication({ stage: "APPLIED" });
    await makeApplication({ stage: "APPLIED" });
    await makeApplication({ stage: "OFFERED" });

    const counts = await applicationPipelineCounts({ companyId });
    expect(counts.APPLIED).toBe(2);
    expect(counts.OFFERED).toBe(1);
    expect(counts.ENROLLED).toBeUndefined();
  });
});
