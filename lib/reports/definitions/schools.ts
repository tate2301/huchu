import { periodParams } from "@/lib/reports/params";
import type { ReportDefinition } from "@/lib/reports/types";

/**
 * A school's reports: who owes what, what came in, who was in class, who is
 * on the roll. Each is gated by the campus grant of the page it reports on —
 * a warden who cannot open the fee ledger cannot read what is owed on it.
 */

const PROFILES = ["SCHOOLS"];

const feeBalances: ReportDefinition = {
  key: "school-fee-balances",
  title: "Fees owed",
  area: "Fees",
  href: "/schools/finance/arrears",
  profiles: PROFILES,
  params: [
    {
      key: "status",
      label: "Invoices",
      type: "choice",
      options: [
        { value: "owing", label: "Still owing" },
        { value: "all", label: "All issued" },
      ],
    },
    { key: "from", label: "Issued", type: "date", default: "yearStart" },
    { key: "to", label: "To", type: "date" },
  ],
  columns: [
    { key: "invoiceNo", label: "Invoice", kind: "code" },
    { key: "student", label: "Pupil", kind: "text" },
    { key: "studentNo", label: "Pupil no.", kind: "code", hidden: true },
    { key: "class", label: "Class", kind: "text" },
    { key: "term", label: "Term", kind: "text" },
    { key: "status", label: "Status", kind: "status" },
    { key: "issued", label: "Issued", kind: "date", hidden: true },
    { key: "due", label: "Due", kind: "date" },
    { key: "daysOverdue", label: "Days overdue", kind: "number", total: "max" },
    { key: "total", label: "Billed", kind: "money", total: "sum" },
    { key: "paid", label: "Paid", kind: "money", total: "sum" },
    { key: "waived", label: "Waived", kind: "money", hidden: true, total: "sum" },
    { key: "balance", label: "Owed", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "balance", dir: "desc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open pupil", href: "/schools/students/{studentId}" }],
};

const feeReceipts: ReportDefinition = {
  key: "school-fee-receipts",
  title: "Fee receipts",
  area: "Fees",
  href: "/schools/finance/ledger",
  profiles: PROFILES,
  params: periodParams(30, "Received"),
  columns: [
    { key: "receiptNo", label: "Receipt", kind: "code" },
    { key: "date", label: "Date", kind: "date" },
    { key: "student", label: "Pupil", kind: "text" },
    { key: "class", label: "Class", kind: "text", hidden: true },
    { key: "method", label: "Method", kind: "status" },
    { key: "reference", label: "Reference", kind: "code", hidden: true },
    { key: "status", label: "Status", kind: "status" },
    { key: "amount", label: "Received", kind: "money", total: "sum" },
    { key: "unallocated", label: "Not yet allocated", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open pupil", href: "/schools/students/{studentId}" }],
};

const registers: ReportDefinition = {
  key: "school-attendance",
  title: "Registers",
  area: "The school day",
  href: "/schools/attendance",
  profiles: PROFILES,
  params: periodParams(7),
  columns: [
    { key: "date", label: "Date", kind: "date" },
    { key: "class", label: "Class", kind: "text" },
    { key: "student", label: "Pupil", kind: "text" },
    { key: "studentNo", label: "Pupil no.", kind: "code", hidden: true },
    { key: "status", label: "Mark", kind: "status", total: "count" },
    { key: "remarks", label: "Remarks", kind: "text" },
  ],
  defaults: { sort: [{ column: "date", dir: "desc" }, { column: "class", dir: "asc" }] },
};

const roll: ReportDefinition = {
  key: "school-roll",
  title: "The roll",
  area: "Pupils",
  href: "/schools/students",
  profiles: PROFILES,
  params: [
    {
      key: "status",
      label: "Pupils",
      type: "choice",
      options: [
        { value: "ACTIVE", label: "On the roll" },
        { value: "all", label: "Everyone" },
      ],
    },
  ],
  columns: [
    { key: "studentNo", label: "Pupil no.", kind: "code" },
    { key: "name", label: "Name", kind: "text" },
    { key: "class", label: "Class", kind: "text" },
    { key: "stream", label: "Stream", kind: "text", hidden: true },
    { key: "gender", label: "Gender", kind: "status" },
    { key: "boarding", label: "Boarding", kind: "status" },
    { key: "house", label: "House", kind: "text", hidden: true },
    { key: "status", label: "Status", kind: "status" },
    { key: "admitted", label: "Admitted", kind: "date", hidden: true },
    { key: "born", label: "Born", kind: "date", hidden: true },
  ],
  defaults: { sort: [{ column: "class", dir: "asc" }, { column: "name", dir: "asc" }] },
  rowActions: [{ id: "open", kind: "open", label: "Open pupil", href: "/schools/students/{id}" }],
};

export const SCHOOL_REPORTS: ReportDefinition[] = [feeBalances, feeReceipts, registers, roll];
