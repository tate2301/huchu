/**
 * What a payslip layout adds to the payslip: the leave left, and the rows a
 * person adds in Build. Pure, so no database.
 */

import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { leaveLeftValue, payslipLeave, payslipPayload, samplePayslipLine, samplePayslipPayload } from "./payslip-payload";
import {
  applyPayslipLayout,
  applyPayslipRows,
  newPayslipRow,
  PAYSLIP_EMPLOYER_TITLE,
  PAYSLIP_LEAVE_TITLE,
  payslipPenaltyShortNote,
} from "./payslip-rows";
import { PENALTY_SEQUENCE } from "@/lib/hr/payroll/penalties";
import type { UniversalDocumentPayload } from "./types";
import { getSamplePayload } from "./sample-payloads";
import { templateSchema } from "./template-schema";
import type { LeaveBalance } from "@/lib/people/leave/balances";

const d = (value: string) => new Prisma.Decimal(value);
const balance = (id: string, name: string, patch: Partial<LeaveBalance> = {}): LeaveBalance => ({
  leaveTypeId: id,
  code: id.toUpperCase(),
  name,
  policyNote: null,
  entitled: d("10"),
  taken: d("0"),
  pending: d("0"),
  remaining: d("10"),
  isUnlimited: false,
  ...patch,
});

describe("the leave a payslip prints", () => {
  it("always prints leave that builds up month by month", () => {
    const leave = payslipLeave({
      balances: [balance("annual", "Annual leave", { entitled: d("18.33"), taken: d("7.33"), remaining: d("11") })],
      accruing: new Set(["annual"]),
      granted: new Set(),
    });
    expect(leave.map(leaveLeftValue)).toEqual(["11 of 18.33 days"]);
  });

  it("leaves out leave granted on need until some is granted or taken, and unlimited leave always", () => {
    const leave = payslipLeave({
      balances: [
        balance("sick", "Sick leave"),
        balance("maternity", "Maternity leave"),
        balance("compassionate", "Compassionate leave", { taken: d("1"), remaining: d("2"), entitled: d("3") }),
        balance("study", "Study leave"),
        balance("unpaid", "Unpaid leave", { isUnlimited: true, taken: d("4") }),
      ],
      accruing: new Set(),
      granted: new Set(["study"]),
    });
    expect(leave.map((entry) => entry.name)).toEqual(["Compassionate leave", "Study leave"]);
  });

  it("says day for one", () => {
    expect(leaveLeftValue({ name: "Leave", remaining: d("0.5"), entitled: d("1") })).toBe("0.5 of 1 day");
  });
});

describe("rows a person adds to the payslip layout", () => {
  const payslip = samplePayslipPayload();

  it("leaves the payslip as it was with none", () => {
    expect(applyPayslipRows(payslip, [])).toBe(payslip);
  });

  it("fills each from the run line, in the part it was added to", () => {
    const out = applyPayslipRows(payslip, [
      { part: "employee", label: "Department", from: "employee.department" },
      { part: "earnings", label: "Allowances", from: "line.allowances" },
      { part: "deductions", label: "Taxed on", from: "line.taxableGross" },
      { part: "net", label: "Paid on", from: "period.payDate" },
      { part: "leave", label: "Run", from: "run.number" },
      { part: "employer", label: "Cost to the company", from: "line.employerCost" },
    ]);

    expect(out.meta!.at(-1)).toEqual({ label: "Department", value: "Fitting" });
    const lines = out.record!.lines!.map((line) => `${line.kind}: ${line.stage} ${line.amount}`);
    // The added earning follows the earnings; the added deduction the deductions.
    expect(lines).toEqual([
      "Earning: Basic pay 780.00",
      "Earning: Allowances 0.00",
      "Statutory: NSSA (31.50)",
      "Statutory: PAYE (152.13)",
      "Statutory: AIDS levy (4.56)",
      "Deduction: Taxed on 748.50",
    ]);
    // Above the net figure, never below it.
    expect(out.totals!.map((total) => total.label)).toEqual(["Gross pay", "Total deductions", "Paid on", "Net pay"]);
    const section = (title: string) => out.record!.sections.find((entry) => entry.title === title)!.rows;
    expect(section(PAYSLIP_LEAVE_TITLE)).toEqual([
      { label: "Annual leave", value: "11 of 22 days" },
      { label: "Run", value: "1" },
    ]);
    expect(section(PAYSLIP_EMPLOYER_TITLE).at(-1)).toEqual({ label: "Cost to the company", value: "39.30" });
  });

  it("prints a dash for a figure the run line lacks, and skips a row with no label", () => {
    const out = applyPayslipRows({ ...payslip, fields: {} }, [
      { part: "employee", label: "Department", from: "employee.department" },
      { part: "employee", label: "  ", from: "line.net" },
      { part: "footer", label: "Nowhere", from: "line.net" },
    ]);
    expect(out.meta!.length).toBe(payslip.meta!.length + 1);
    expect(out.meta!.at(-1)).toEqual({ label: "Department", value: "—" });
  });

  it("are kept in the layout's own JSON, and start named after their figure", () => {
    const row = newPayslipRow("deductions");
    const parsed = templateSchema.parse({ rows: [row] });
    expect(parsed.rows).toEqual([{ part: "deductions", label: "Taxable gross", from: "line.taxableGross" }]);
    expect(templateSchema.parse({}).rows).toEqual([]);
  });
});

describe("what a payslip layout shows", () => {
  // The sample, with a deduction from a rule, a penalty, and a zero line in each table.
  const base = samplePayslipPayload();
  const penaltyNote = payslipPenaltyShortNote({ summary: "Late for shift", marked: "US$50.00", deducted: "US$20.00" });
  const payslip: UniversalDocumentPayload = {
    ...base,
    notes: [...(base.notes ?? []), penaltyNote],
    record: {
      ...base.record!,
      lines: [
        ...base.record!.lines!,
        { stage: "Union dues", kind: "Deduction", amount: "(12.00)" },
        { stage: "Late for shift", kind: "Penalty", amount: "(20.00)" },
        { stage: "Overtime", kind: "Earning", amount: "0.00" },
        { stage: "Funeral cover", kind: "Deduction", amount: "(0.00)" },
      ],
      sections: base.record!.sections.map((section) =>
        section.title === PAYSLIP_EMPLOYER_TITLE ? { ...section, rows: [{ label: "SDL (0.50% of 0.00)", value: "0.00" }, ...section.rows] } : section,
      ),
    },
  };
  const stages = (out: UniversalDocumentPayload) => out.record!.lines!.map((line) => String(line.stage));

  it("shows every kind of deduction, and hides rows that are zero, by default", () => {
    const out = applyPayslipLayout(payslip, templateSchema.parse({}));
    expect(stages(out)).toEqual(["Basic pay", "NSSA", "PAYE", "AIDS levy", "Union dues", "Late for shift"]);
    const employer = out.record!.sections.find((section) => section.title === PAYSLIP_EMPLOYER_TITLE)!;
    expect(employer.rows.map((row) => row.label)).not.toContain("SDL (0.50% of 0.00)");
    expect(out.notes).toContain(penaltyNote);
  });

  it("leaves out the kinds a person unticks, and a penalty's note with the penalties", () => {
    expect(stages(applyPayslipLayout(payslip, { payslip: { statutory: false } }))).toEqual(["Basic pay", "Union dues", "Late for shift"]);
    expect(stages(applyPayslipLayout(payslip, { payslip: { otherDeductions: false } }))).toEqual(["Basic pay", "NSSA", "PAYE", "AIDS levy", "Late for shift"]);
    const noPenalties = applyPayslipLayout(payslip, { payslip: { penalties: false } });
    expect(stages(noPenalties)).not.toContain("Late for shift");
    expect(noPenalties.notes).not.toContain(penaltyNote);
  });

  it("keeps zero rows when told to, and never drops a total or the figures that add up", () => {
    const out = applyPayslipLayout(payslip, { payslip: { hideZero: false, statutory: false } });
    expect(stages(out)).toContain("Overtime");
    expect(stages(out)).toContain("Funeral cover");
    expect(out.totals).toEqual(payslip.totals);
    const employer = applyPayslipLayout(payslip, {}).record!.sections.find((section) => section.title === PAYSLIP_EMPLOYER_TITLE)!;
    expect(employer.rows.at(-1)!.label).toBe("Total employer contributions");
  });

  it("adds a person's rows after it has hidden the rest", () => {
    const out = applyPayslipLayout(payslip, { payslip: { otherDeductions: false }, rows: [{ part: "deductions", label: "Taxed on", from: "line.taxableGross" }] });
    expect(stages(out)).toContain("Taxed on");
  });

  it("keeps the choices in the layout's own JSON", () => {
    expect(templateSchema.parse({}).payslip).toEqual({ statutory: true, otherDeductions: true, penalties: true, hideZero: true });
    expect(templateSchema.parse({ payslip: { penalties: false } }).payslip.penalties).toBe(false);
  });
});

describe("the payslip layout's page", () => {
  it("is drawn as a payslip, not a stand-in table", () => {
    const sample = getSamplePayload("hr.payslip");
    expect(sample.title).toBe("Payslip");
    expect(sample.record!.sections.map((section) => section.title)).toEqual([
      "How your pay was worked out",
      PAYSLIP_LEAVE_TITLE,
      PAYSLIP_EMPLOYER_TITLE,
    ]);
    expect(sample.totals!.at(-1)).toEqual({ label: "Net pay", value: "US$591.81", emphasis: true });
  });
});

describe("a disciplinary penalty payroll took", () => {
  const line = samplePayslipLine();
  const penalty = (summary: string, marked: string, taken: string) => ({
    name: `Disciplinary penalty \u2014 ${summary}`,
    type: "DEDUCTION",
    calcMethod: "FIXED",
    rateOrAmount: d(marked),
    amount: d(taken),
    isTaxable: false,
    statutoryKey: null,
    basis: null,
    sequence: PENALTY_SEQUENCE,
  });
  // The sample's 188.19 of deductions and 591.81 net, with a 20.00 penalty taken.
  const withPenalty = payslipPayload(
    { ...line, deductionsTotal: d("208.19"), netAmount: d("571.81"), components: [...line.components, penalty("Late for shift", "20", "20")] },
    [],
  ).payload;

  it("prints among the deductions, and in Total deductions and Net pay", () => {
    const lines = withPenalty.record!.lines!;
    expect(lines.map((row) => [row.stage, row.kind, row.amount])).toContainEqual(["Late for shift", "Penalty", "(20.00)"]);
    // After the statutory lines, never among the earnings or the employer's.
    expect(lines.findIndex((row) => row.kind === "Penalty")).toBeGreaterThan(lines.findIndex((row) => row.stage === "AIDS levy"));
    expect(withPenalty.totals).toEqual([
      { label: "Gross pay", value: "US$780.00" },
      { label: "Total deductions", value: "US$208.19" },
      { label: "Net pay", value: "US$571.81", emphasis: true },
    ]);
    expect(withPenalty.notes!.some((note) => /penalt/i.test(note))).toBe(false);
  });

  it("is hidden by the Show penalties tick while the totals keep it", () => {
    const hidden = applyPayslipLayout(withPenalty, { payslip: { penalties: false } });
    expect(hidden.record!.lines!.some((row) => row.kind === "Penalty")).toBe(false);
    expect(hidden.totals).toEqual(withPenalty.totals);
  });

  it("says how much net pay could not cover", () => {
    const capped = payslipPayload({ ...line, components: [...line.components, penalty("Damaged tools", "800", "591.81")] }, []).payload;
    expect(capped.notes).toContain(payslipPenaltyShortNote({ summary: "Damaged tools", marked: "US$800.00", deducted: "US$591.81" }));
    expect(applyPayslipLayout(capped, { payslip: { penalties: false } }).notes!.some((note) => note.includes("Damaged tools"))).toBe(false);
  });
});
