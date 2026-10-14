import type { UniversalDocumentPayload } from "@/lib/documents/types";
import type { TemplateRow } from "@/lib/documents/template-schema";

/**
 * The rows a person adds to a payslip layout in Build (PageTemplatePayslip):
 * a label, and the figure of the run line that fills it. They live in the
 * layout's own JSON (`rows` in the template schema), so every payslip printed
 * with that layout carries them, and the run line still decides the figures.
 *
 * No Prisma here: the builder's inspector reads the lists below in the browser.
 */

/** Section titles the payslip prints, shared with `payslip-payload.ts` so added rows land in the right one. */
export const PAYSLIP_LEAVE_TITLE = "Leave left";
export const PAYSLIP_EMPLOYER_TITLE = "Paid by your employer on your behalf";

/** The parts of the payslip a row can be added to (the outline's ids in `layoutParts`). */
export const PAYSLIP_ROW_PARTS = ["employee", "earnings", "deductions", "net", "leave", "employer"] as const;
export type PayslipRowPart = (typeof PAYSLIP_ROW_PARTS)[number];

export function isPayslipRowPart(part: string): part is PayslipRowPart {
  return (PAYSLIP_ROW_PARTS as readonly string[]).includes(part);
}

/** Where an added row's value comes from: what the run line, its employee and its run hold. */
export const PAYSLIP_ROW_SOURCES = [
  { key: "line.basic", label: "Basic salary" },
  { key: "line.allowances", label: "Allowances" },
  { key: "line.gross", label: "Gross pay" },
  { key: "line.taxableGross", label: "Taxable gross" },
  { key: "line.deductions", label: "Total deductions" },
  { key: "line.net", label: "Net pay" },
  { key: "line.employerCost", label: "Employer contributions" },
  { key: "line.netBase", label: "Net pay, reporting currency" },
  { key: "line.exchangeRate", label: "Exchange rate" },
  { key: "line.currency", label: "Currency" },
  { key: "employee.department", label: "Department" },
  { key: "employee.position", label: "Position" },
  { key: "period.payDate", label: "Pay date" },
  { key: "run.number", label: "Run number" },
] as const;
export type PayslipRowSource = (typeof PAYSLIP_ROW_SOURCES)[number]["key"];

export const payslipRowSourceLabel = (key: string) => PAYSLIP_ROW_SOURCES.find((source) => source.key === key)?.label ?? key;

/** A blank row for the part, filled from the first source until the person picks another. */
export function newPayslipRow(part: PayslipRowPart): TemplateRow {
  const from = part === "net" || part === "deductions" ? "line.taxableGross" : part === "employee" ? "employee.department" : "line.basic";
  return { part, label: payslipRowSourceLabel(from), from };
}

const lineAfter = (lines: Array<Record<string, unknown>>, kinds: string[]) => {
  let at = -1;
  lines.forEach((line, index) => {
    if (kinds.includes(String(line.kind ?? ""))) at = index;
  });
  return at + 1;
};

/**
 * The payslip with the layout's added rows put where the outline shows them:
 * the employee's among the labels, earnings and deductions among the lines,
 * net pay's above the net figure, leave and employer rows in their sections.
 * Values come from `payload.fields`; a field the run line lacks prints "—".
 */
export function applyPayslipRows(payload: UniversalDocumentPayload, rows: readonly TemplateRow[] | undefined): UniversalDocumentPayload {
  const added = (rows ?? []).filter((row) => isPayslipRowPart(row.part) && row.label.trim());
  if (added.length === 0) return payload;
  const fields = payload.fields ?? {};
  const value = (row: TemplateRow) => fields[row.from]?.trim() || "—";

  const meta = [...(payload.meta ?? [])];
  const totals = [...(payload.totals ?? [])];
  const record = payload.record ?? { sections: [] };
  const lines = [...(record.lines ?? [])];
  const sections = record.sections.map((section) => ({ ...section, rows: [...section.rows] }));
  const section = (title: string) => {
    let found = sections.find((entry) => entry.title === title);
    if (!found) {
      found = { title, rows: [] };
      sections.push(found);
    }
    return found;
  };

  for (const row of added) {
    const label = row.label.trim();
    switch (row.part as PayslipRowPart) {
      case "employee":
        meta.push({ label, value: value(row) });
        break;
      case "earnings":
        lines.splice(lineAfter(lines, ["Earning"]), 0, { stage: label, kind: "Earning", rate: "", calculatedOn: "", amount: value(row), taxable: "" });
        break;
      case "deductions":
        lines.splice(lineAfter(lines, ["Earning", "Statutory", "Deduction"]), 0, { stage: label, kind: "Deduction", rate: "", calculatedOn: "", amount: value(row), taxable: "" });
        break;
      case "net": {
        const net = totals.findIndex((total) => total.emphasis);
        totals.splice(net === -1 ? totals.length : net, 0, { label, value: value(row) });
        break;
      }
      case "leave":
        section(PAYSLIP_LEAVE_TITLE).rows.push({ label, value: value(row) });
        break;
      case "employer":
        section(PAYSLIP_EMPLOYER_TITLE).rows.push({ label, value: value(row) });
        break;
    }
  }

  return { ...payload, meta, totals, record: { ...record, sections, lines } };
}
