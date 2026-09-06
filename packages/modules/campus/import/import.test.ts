/**
 * Importing a school that is switching systems.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the schema pushed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { guessMapping, parseCsv } from "@corelithzw/platform/import-core/csv";
import { prisma } from "@corelithzw/db/client";

import { closestMatch, normalizePhone, parseDateCell, parseMoneyCell } from "./cells";
import {
  OPENING_BALANCE_FEE_CODE,
  SCHOOL_IMPORT_HANDLERS,
  SCHOOL_IMPORT_ORDER,
  handlerFor,
} from "./registry";
import {
  commitImportJob,
  planImportJob,
  rollbackImportJob,
  stageImportJob,
} from "./service";

let companyId: string;
let actorId: string;

function date(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`);
}

beforeAll(async () => {
  await prisma.$connect();
  const stamp = `${Date.now()}-${process.pid.toString(36)}`;

  const company = await prisma.company.create({
    data: { name: `Import Test ${stamp}`, slug: `import-test-${stamp}` },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      email: `import-${stamp}@example.test`,
      name: "Registrar",
      role: "REGISTRAR",
      companyId,
    },
  });
  actorId = user.id;

  const year = await prisma.schoolAcademicYear.create({
    data: {
      companyId,
      code: "2026",
      name: "2026",
      startDate: date("2026-01-01"),
      endDate: date("2026-12-31"),
      isActive: true,
    },
  });

  await prisma.schoolTerm.create({
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
});

afterAll(async () => {
  // `User` is a restrict-delete parent, so deleting the company alone fails and
  // — swallowed by a bare catch — leaves an orphan tenant behind on every run.
  // Unwound by hand, and the company delete is NOT caught: a cleanup that
  // silently does nothing is how a dev database fills up with test schools.
  await prisma.schoolImportArtifact.deleteMany({ where: { companyId } });
  await prisma.schoolImportRow.deleteMany({ where: { companyId } });
  await prisma.schoolImportJob.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

beforeEach(async () => {
  await prisma.schoolImportArtifact.deleteMany({ where: { companyId } });
  await prisma.schoolImportRow.deleteMany({ where: { companyId } });
  await prisma.schoolImportJob.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoiceLine.deleteMany({ where: { companyId } });
  await prisma.schoolFeeInvoice.deleteMany({ where: { companyId } });
  await prisma.schoolFeeStructureLine.deleteMany({ where: { companyId } });
  await prisma.schoolFeeStructure.deleteMany({ where: { companyId } });
  await prisma.schoolStudentGuardian.deleteMany({ where: { companyId } });
  await prisma.schoolGuardian.deleteMany({ where: { companyId } });
  await prisma.schoolEnrollment.deleteMany({ where: { companyId } });
  await prisma.schoolStudent.deleteMany({ where: { companyId } });
  await prisma.schoolClass.deleteMany({ where: { companyId } });
});

async function runImport(entityType: Parameters<typeof handlerFor>[0], csv: string) {
  const job = await stageImportJob(prisma, {
    companyId,
    entityType,
    fileName: `${entityType}.csv`,
    csvText: csv,
    uploadedById: actorId,
  });
  const plan = await planImportJob(prisma, job.id, companyId);
  const commit = await commitImportJob(prisma, { jobId: job.id, companyId, actorId });
  return { job, plan, commit };
}

const CLASSES_CSV = `Class code,Class name,Level,Capacity
F1B,Form 1 Blue,1,30
F1G,Form 1 Green,1,30
`;

// ---------------------------------------------------------------------------

describe("reading a cell", () => {
  it("keeps a money value that a float would lose", () => {
    const parsed = parseMoneyCell("8.575");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Postgres numeric rounds half-up to 8.58. The old
    // Math.round((v + EPSILON) * 100) / 100 helper returned 8.57.
    expect(parsed.value.toFixed(2)).toBe("8.58");
  });

  it("survives a whole term's fees without drifting", () => {
    const total = ["416.67", "416.67", "416.66"]
      .map((raw) => {
        const parsed = parseMoneyCell(raw);
        if (!parsed.ok) throw new Error(parsed.message);
        return parsed.value;
      })
      .reduce((sum, value) => sum.plus(value));
    expect(total.toFixed(2)).toBe("1250.00");
  });

  it("reads what a finance export actually writes", () => {
    for (const [raw, expected] of [
      ["$1,250.00", "1250.00"],
      ["1 250,50".replace(",", "."), "1250.50"],
      ["USD 900", "900.00"],
      ["(450.00)", "-450.00"],
    ] as const) {
      const parsed = parseMoneyCell(raw);
      expect(parsed.ok, `${raw} should parse`).toBe(true);
      if (parsed.ok) expect(parsed.value.toFixed(2)).toBe(expected);
    }
  });

  it("refuses a cell that is not an amount", () => {
    for (const raw of ["", "n/a", "to be confirmed", "1.2.3"]) {
      expect(parseMoneyCell(raw).ok, `${raw} should be refused`).toBe(false);
    }
  });

  it("refuses an ambiguous date rather than guessing a month", () => {
    const parsed = parseDateCell("03/04/2019");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.message).toContain("YYYY-MM-DD");
      expect(parsed.message).toContain("April");
    }
  });

  it("takes an unambiguous day-first date", () => {
    const parsed = parseDateCell("23/04/2019");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.toISOString().slice(0, 10)).toBe("2019-04-23");
  });

  it("refuses a day that does not exist", () => {
    expect(parseDateCell("2019-02-31").ok).toBe(false);
  });

  it("treats the two ways of writing a Zimbabwean mobile as one number", () => {
    expect(normalizePhone("+263 77 123 4567")).toBe(normalizePhone("077 123 4567"));
  });

  it("suggests a near miss but not a different class", () => {
    expect(closestMatch("Frm 1 Blue", ["Form 1 Blue", "Form 4 Green"])).toBe("Form 1 Blue");
    expect(closestMatch("Upper Sixth", ["Form 1 Blue", "Form 4 Green"])).toBeNull();
  });
});

describe("the field mapping", () => {
  it("guesses columns from the headers a school actually uses", () => {
    const table = parseCsv("Reg No,Forename,Surname,Form\n1,A,B,C\n");
    const mapping = guessMapping(table.headers, SCHOOL_IMPORT_HANDLERS.STUDENT.fields);
    expect(mapping.studentNo).toBe("Reg No");
    expect(mapping.firstName).toBe("Forename");
    expect(mapping.lastName).toBe("Surname");
    expect(mapping.className).toBe("Form");
  });

  it("loads classes before students, and students before guardians and balances", () => {
    expect(SCHOOL_IMPORT_ORDER).toEqual([
      "CLASS",
      "STUDENT",
      "GUARDIAN",
      "FEE_STRUCTURE",
      "OPENING_BALANCE",
    ]);
    expect(SCHOOL_IMPORT_HANDLERS.STUDENT.dependsOn).toContain("CLASS");
    expect(SCHOOL_IMPORT_HANDLERS.GUARDIAN.dependsOn).toContain("STUDENT");
    expect(SCHOOL_IMPORT_HANDLERS.OPENING_BALANCE.dependsOn).toContain("STUDENT");
  });
});

describe("importing students", () => {
  beforeEach(async () => {
    await runImport("CLASS", CLASSES_CSV);
  });

  it("enrols every student it creates", async () => {
    const { commit } = await runImport(
      "STUDENT",
      `Reg No,Forename,Surname,Form,DOB
S0001,Tendai,Moyo,Form 1 Blue,2014-03-02
S0002,Rudo,Chikafu,Form 1 Green,2014-07-19
`,
    );

    expect(commit.created).toBe(2);

    const students = await prisma.schoolStudent.findMany({
      where: { companyId },
      include: { enrollments: true },
    });
    expect(students).toHaveLength(2);

    // provisionSchool writes currentClassId and no enrolment, which leaves the
    // year roll-up with no history of who was in which class. An importer that
    // repeated that would ship the same hole at scale.
    for (const student of students) {
      expect(student.currentClassId).toBeTruthy();
      expect(student.enrollments, `${student.studentNo} has no enrolment`).toHaveLength(1);
      expect(student.enrollments[0].classId).toBe(student.currentClassId);
      expect(student.enrollments[0].status).toBe("ACTIVE");
    }
  });

  it("names the near-miss class rather than the foreign key", async () => {
    const { plan } = await runImport(
      "STUDENT",
      `Reg No,Forename,Surname,Form
S0003,Farai,Ncube,Frm 1 Blue
`,
    );

    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0].lineNo).toBe(2);
    expect(plan.rejected[0].issues[0].message).toContain('did you mean "Form 1 Blue"');
  });

  it("writes nothing for a rejected row", async () => {
    await runImport(
      "STUDENT",
      `Reg No,Forename,Surname,Form
S0004,Good,Row,Form 1 Blue
S0005,Bad,Row,Not A Class
`,
    );

    const students = await prisma.schoolStudent.findMany({
      where: { companyId },
      select: { studentNo: true },
    });
    expect(students.map((student) => student.studentNo)).toEqual(["S0004"]);
  });

  it("does not duplicate anybody on a second run", async () => {
    const csv = `Reg No,Forename,Surname,Form
S0006,Tanaka,Dube,Form 1 Blue
S0007,Chipo,Marufu,Form 1 Green
`;
    await runImport("STUDENT", csv);
    await runImport("STUDENT", csv);

    expect(await prisma.schoolStudent.count({ where: { companyId } })).toBe(2);
    expect(await prisma.schoolEnrollment.count({ where: { companyId } })).toBe(2);
  });
});

describe("importing guardians", () => {
  beforeEach(async () => {
    await runImport("CLASS", CLASSES_CSV);
    await runImport(
      "STUDENT",
      `Reg No,Forename,Surname,Form
S0100,Tendai,Moyo,Form 1 Blue
S0101,Anesu,Moyo,Form 1 Green
`,
    );
  });

  it("links one parent to both of their children", async () => {
    const { commit } = await runImport(
      "GUARDIAN",
      `Student number,First name,Surname,Phone,Relationship
S0100,Grace,Moyo,+263 77 123 4567,Mother
S0101,Grace,Moyo,077 123 4567,Mother
`,
    );

    // One parent, written the two ways a spreadsheet writes a mobile. The
    // second row recognises the mother the first row created — which only works
    // because the match is resolved again at commit time, not taken from a plan
    // drawn before she existed.
    expect(commit.created).toBe(1);
    expect(commit.updated).toBe(1);
    expect(await prisma.schoolGuardian.count({ where: { companyId } })).toBe(1);
    // Both children keep their contact. "Already on file" is not a reason to
    // leave the second one without a parent.
    expect(await prisma.schoolStudentGuardian.count({ where: { companyId } })).toBe(2);
  });

  it("refuses a parent whose child is not on the roll", async () => {
    const { plan } = await runImport(
      "GUARDIAN",
      `Student number,First name,Surname,Phone,Relationship
S9999,Lost,Parent,0771230000,Father
`,
    );
    expect(plan.rejected[0].issues[0].message).toContain("No student with number");
  });
});

describe("importing fee structures", () => {
  beforeEach(async () => {
    await runImport("CLASS", CLASSES_CSV);
  });

  it("groups lines under one structure per class", async () => {
    await runImport(
      "FEE_STRUCTURE",
      `Class,Fee structure,Fee code,Description,Amount
Form 1 Blue,Term 1 Tuition,TUITION,Tuition,$450.00
Form 1 Blue,Term 1 Tuition,LEVY,Development levy,"1,250.00"
Form 1 Green,Term 1 Tuition,TUITION,Tuition,450
`,
    );

    const structures = await prisma.schoolFeeStructure.findMany({
      where: { companyId },
      include: { lines: true },
    });
    expect(structures).toHaveLength(2);

    const blue = structures.find((structure) => structure.lines.length === 2);
    expect(blue).toBeTruthy();
    const levy = blue!.lines.find((line) => line.feeCode === "LEVY");
    expect(levy!.amount.toFixed(2)).toBe("1250.00");
  });

  it("refuses a negative fee", async () => {
    const { plan } = await runImport(
      "FEE_STRUCTURE",
      `Class,Fee structure,Fee code,Description,Amount
Form 1 Blue,Term 1 Tuition,TUITION,Tuition,-450
`,
    );
    expect(plan.rejected[0].issues[0].message).toContain("cannot be negative");
  });
});

describe("importing opening balances", () => {
  beforeEach(async () => {
    await runImport("CLASS", CLASSES_CSV);
    await runImport(
      "STUDENT",
      `Reg No,Forename,Surname,Form
S0200,Kuda,Zhou,Form 1 Blue
`,
    );
  });

  it("bills the family what they already owed, to the cent", async () => {
    const { commit } = await runImport(
      "OPENING_BALANCE",
      `Student number,Amount owing,As at,Reference
S0200,"1,234.56",2026-01-08,Brought forward from Sage
`,
    );
    expect(commit.created).toBe(1);

    const invoice = await prisma.schoolFeeInvoice.findFirstOrThrow({
      where: { companyId },
      include: { lines: true },
    });

    // What the parent sees.
    expect(invoice.totalAmount.toFixed(2)).toBe("1234.56");
    expect(invoice.balanceAmount.toFixed(2)).toBe("1234.56");
    expect(invoice.status).toBe("ISSUED");
    // What the ledger sees.
    expect(invoice.baseAmount.toFixed(2)).toBe("1234.56");
    // Outside the one-live-invoice index, so it cannot block the term's first
    // real bill.
    expect(invoice.feeStructureId).toBeNull();
    expect(invoice.lines[0].feeCode).toBe(OPENING_BALANCE_FEE_CODE);
  });

  it("does not bill a family twice when the import is re-run", async () => {
    const csv = `Student number,Amount owing
S0200,900.00
`;
    await runImport("OPENING_BALANCE", csv);
    const second = await runImport("OPENING_BALANCE", csv);

    expect(await prisma.schoolFeeInvoice.count({ where: { companyId } })).toBe(1);
    expect(second.commit.skipped).toBe(1);
  });

  it("refuses a credit rather than billing a negative", async () => {
    const { plan } = await runImport(
      "OPENING_BALANCE",
      `Student number,Amount owing
S0200,-120.00
`,
    );
    expect(plan.rejected[0].issues[0].message).toContain("credit, not an amount owing");
  });
});

describe("a dry run", () => {
  it("changes nothing", async () => {
    await runImport("CLASS", CLASSES_CSV);

    const before = {
      students: await prisma.schoolStudent.count({ where: { companyId } }),
      enrollments: await prisma.schoolEnrollment.count({ where: { companyId } }),
      guardians: await prisma.schoolGuardian.count({ where: { companyId } }),
      invoices: await prisma.schoolFeeInvoice.count({ where: { companyId } }),
    };

    const job = await stageImportJob(prisma, {
      companyId,
      entityType: "STUDENT",
      fileName: "students.csv",
      csvText: `Reg No,Forename,Surname,Form
S0300,Dry,Run,Form 1 Blue
S0301,Also,Dry,Form 1 Green
`,
      uploadedById: actorId,
    });

    const plan = await planImportJob(prisma, job.id, companyId);
    expect(plan.totals.create).toBe(2);

    expect({
      students: await prisma.schoolStudent.count({ where: { companyId } }),
      enrollments: await prisma.schoolEnrollment.count({ where: { companyId } }),
      guardians: await prisma.schoolGuardian.count({ where: { companyId } }),
      invoices: await prisma.schoolFeeInvoice.count({ where: { companyId } }),
    }).toEqual(before);
  });
});

describe("rolling back", () => {
  it("puts the school back exactly as it was", async () => {
    await runImport("CLASS", CLASSES_CSV);

    const before = {
      students: await prisma.schoolStudent.count({ where: { companyId } }),
      enrollments: await prisma.schoolEnrollment.count({ where: { companyId } }),
      guardians: await prisma.schoolGuardian.count({ where: { companyId } }),
      links: await prisma.schoolStudentGuardian.count({ where: { companyId } }),
    };

    const students = await runImport(
      "STUDENT",
      `Reg No,Forename,Surname,Form
S0400,Roll,Back,Form 1 Blue
`,
    );
    const guardians = await runImport(
      "GUARDIAN",
      `Student number,First name,Surname,Phone,Relationship
S0400,Parent,Ofrollback,0779999999,Mother
`,
    );

    expect(await prisma.schoolStudent.count({ where: { companyId } })).toBe(before.students + 1);

    await rollbackImportJob(prisma, {
      jobId: guardians.job.id,
      companyId,
      actorId,
    });
    await rollbackImportJob(prisma, {
      jobId: students.job.id,
      companyId,
      actorId,
    });

    expect({
      students: await prisma.schoolStudent.count({ where: { companyId } }),
      enrollments: await prisma.schoolEnrollment.count({ where: { companyId } }),
      guardians: await prisma.schoolGuardian.count({ where: { companyId } }),
      links: await prisma.schoolStudentGuardian.count({ where: { companyId } }),
    }).toEqual(before);

    // Nothing left pointing at rows that no longer exist.
    expect(
      await prisma.schoolImportArtifact.count({
        where: { companyId, row: { jobId: students.job.id } },
      }),
    ).toBe(0);
  });
});

describe("the staging table", () => {
  it("refuses one row per line number twice", async () => {
    const job = await stageImportJob(prisma, {
      companyId,
      entityType: "CLASS",
      fileName: "classes.csv",
      csvText: CLASSES_CSV,
      uploadedById: actorId,
    });

    // Past the service layer, straight at the database, which is the only way
    // to prove the constraint rather than the code in front of it.
    await expect(
      prisma.schoolImportRow.create({
        data: { companyId, jobId: job.id, lineNo: 2, rawJson: {} },
      }),
    ).rejects.toThrow();
  });
});
