import {
  Checklist,
  FileCheck,
  ManageAccounts,
  ShieldCheck,
  UserCheck,
  Users,
  type LucideIcon,
} from "@/lib/icons";

/**
 * People — the workforce record.
 *
 * What this is not: payroll. The module it replaces had six nav categories and
 * five of them were money, leaving "People" holding two tabs — Employees and
 * Workforce Incidents — while Compensation, Payroll, Statutory and Approvals took
 * the rest. Anyone opening it to look up a phone number walked past four screens
 * about salary bills first.
 *
 * Compensation, runs, disbursements, statutory tables and returns are now
 * `lib/payroll/tab-config.ts`. What stays here is the record of the person: who
 * they are, what they are contracted to do, when they worked, what happened to
 * them, and what they are owed in leave rather than in money.
 *
 * Approvals history stays on this side. It is a workforce audit trail spanning
 * discipline, compensation, payroll and settlements — `ApprovalAction` has no
 * foreign key to its target — so it belongs with the people rather than with any
 * one of the things being approved.
 */

export type PeopleTab =
  | "employees"
  | "attendance"
  | "leave"
  | "holidays"
  | "incidents"
  | "shift-groups"
  | "approvals";

export type PeopleCategoryId = "directory" | "time" | "records" | "audit";

export type PeopleCategory = {
  id: PeopleCategoryId;
  label: string;
  icon: LucideIcon;
  order: number;
};

export const PEOPLE_CATEGORIES: PeopleCategory[] = [
  { id: "directory", label: "Directory", icon: Users, order: 1 },
  { id: "time", label: "Time", icon: Checklist, order: 2 },
  { id: "records", label: "Records", icon: ShieldCheck, order: 3 },
  { id: "audit", label: "Audit", icon: FileCheck, order: 4 },
];

export type PeopleTabItem = {
  id: PeopleTab;
  label: string;
  href: string;
  icon: LucideIcon;
  categoryId: PeopleCategoryId;
};

export const PEOPLE_TABS: PeopleTabItem[] = [
  {
    id: "employees",
    label: "Employees",
    href: "/people",
    icon: ManageAccounts,
    categoryId: "directory",
  },
  {
    id: "shift-groups",
    label: "Rosters",
    href: "/people/rosters",
    icon: Users,
    categoryId: "time",
  },
  {
    id: "attendance",
    label: "Attendance",
    href: "/people/attendance",
    icon: UserCheck,
    categoryId: "time",
  },
  {
    id: "leave",
    label: "Leave",
    href: "/people/leave",
    icon: Checklist,
    categoryId: "time",
  },
  {
    id: "holidays",
    label: "Public holidays",
    href: "/people/leave/holidays",
    icon: FileCheck,
    categoryId: "time",
  },
  {
    id: "incidents",
    label: "Incidents",
    href: "/people/incidents",
    icon: ShieldCheck,
    categoryId: "records",
  },
  {
    id: "approvals",
    label: "History",
    href: "/people/approvals",
    icon: FileCheck,
    categoryId: "audit",
  },
];
