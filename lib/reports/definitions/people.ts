import { periodParams } from "@/lib/reports/params";
import type { ReportDefinition } from "@/lib/reports/types";

/** People and pay: who works here, what they were paid, who was away. */

const PROFILES = ["PAYROLL"];

const pay: ReportDefinition = {
  key: "payroll-pay",
  title: "Pay by employee",
  area: "Pay",
  href: "/payroll/runs",
  profiles: PROFILES,
  params: [
    { key: "from", label: "Periods", type: "date", default: "-90d" },
    { key: "to", label: "To", type: "date", default: "today" },
  ],
  columns: [
    { key: "period", label: "Period", kind: "code" },
    { key: "employee", label: "Employee", kind: "text" },
    { key: "employeeNo", label: "Employee no.", kind: "code", hidden: true },
    { key: "department", label: "Department", kind: "text" },
    { key: "run", label: "Run", kind: "status" },
    { key: "gross", label: "Gross", kind: "money", total: "sum" },
    { key: "allowances", label: "Allowances", kind: "money", hidden: true, total: "sum" },
    { key: "deductions", label: "Deductions", kind: "money", total: "sum" },
    { key: "net", label: "Net", kind: "money", total: "sum" },
    { key: "employerCost", label: "Employer cost", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "period", dir: "desc" }, { column: "employee", dir: "asc" }], groupBy: "period" },
};

const people: ReportDefinition = {
  key: "people-register",
  title: "Employees",
  area: "People",
  href: "/people",
  profiles: PROFILES,
  params: [
    {
      key: "status",
      label: "Employees",
      type: "choice",
      options: [
        { value: "active", label: "Working here" },
        { value: "all", label: "Everyone" },
      ],
    },
  ],
  columns: [
    { key: "employeeNo", label: "Employee no.", kind: "code" },
    { key: "name", label: "Name", kind: "text" },
    { key: "jobTitle", label: "Job title", kind: "text" },
    { key: "department", label: "Department", kind: "text" },
    { key: "position", label: "Role", kind: "status", hidden: true },
    { key: "phone", label: "Phone", kind: "phone" },
    { key: "hired", label: "Joined", kind: "date" },
    { key: "status", label: "Status", kind: "status", hidden: true },
  ],
  defaults: { sort: [{ column: "name", dir: "asc" }] },
};

const leave: ReportDefinition = {
  key: "people-leave",
  title: "Leave",
  area: "People",
  href: "/people/leave",
  profiles: PROFILES,
  params: periodParams(90, "Starting"),
  columns: [
    { key: "employee", label: "Employee", kind: "text" },
    { key: "type", label: "Leave", kind: "status" },
    { key: "start", label: "From", kind: "date" },
    { key: "end", label: "To", kind: "date" },
    { key: "days", label: "Working days", kind: "number", total: "sum" },
    { key: "status", label: "Status", kind: "status" },
    { key: "reason", label: "Reason", kind: "text", hidden: true },
  ],
  defaults: { sort: [{ column: "start", dir: "desc" }] },
};

export const PEOPLE_REPORTS: ReportDefinition[] = [pay, people, leave];
