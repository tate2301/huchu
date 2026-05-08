import {
  Checklist,
  Coins,
  FileCheck,
  ManageAccounts,
  Payments,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "@/lib/icons";

export type HrTab =
  | "employees"
  | "shift-groups"
  | "incidents"
  | "payouts"
  | "compensation"
  | "salaries"
  | "salary-outstanding"
  | "payroll"
  | "disbursements"
  | "approvals";

export type HrCategoryId =
  | "people"
  | "shifts"
  | "compensation"
  | "payroll"
  | "approvals";

export type HrCategory = {
  id: HrCategoryId;
  label: string;
  icon: LucideIcon;
  order: number;
};

export const HR_CATEGORIES: HrCategory[] = [
  { id: "people", label: "People", icon: Users, order: 1 },
  { id: "shifts", label: "Shifts", icon: Checklist, order: 2 },
  { id: "compensation", label: "Compensation", icon: UserRound, order: 3 },
  { id: "payroll", label: "Payroll", icon: Coins, order: 4 },
  { id: "approvals", label: "Approvals", icon: FileCheck, order: 5 },
];

export type HrTabItem = {
  id: HrTab;
  label: string;
  href: string;
  icon: LucideIcon;
  categoryId: HrCategoryId;
};

export const HR_TABS: HrTabItem[] = [
  {
    id: "employees",
    label: "Employees",
    href: "/human-resources",
    icon: ManageAccounts,
    categoryId: "people",
  },
  {
    id: "incidents",
    label: "Workforce Incidents",
    href: "/human-resources/incidents",
    icon: ShieldCheck,
    categoryId: "people",
  },
  {
    id: "shift-groups",
    label: "Groups",
    href: "/human-resources/shift-groups",
    icon: Users,
    categoryId: "shifts",
  },
  {
    id: "compensation",
    label: "Rules",
    href: "/human-resources/compensation",
    icon: UserRound,
    categoryId: "compensation",
  },
  {
    id: "salaries",
    label: "Salaries",
    href: "/human-resources/salaries",
    icon: Payments,
    categoryId: "compensation",
  },
  {
    id: "salary-outstanding",
    label: "Outstanding",
    href: "/human-resources/salaries/outstanding",
    icon: Wallet,
    categoryId: "compensation",
  },
  {
    id: "payroll",
    label: "Runs",
    href: "/human-resources/payroll",
    icon: Checklist,
    categoryId: "payroll",
  },
  {
    id: "payouts",
    label: "Settlements",
    href: "/human-resources/payouts",
    icon: Coins,
    categoryId: "payroll",
  },
  {
    id: "disbursements",
    label: "Disbursements",
    href: "/human-resources/disbursements",
    icon: Wallet,
    categoryId: "payroll",
  },
  {
    id: "approvals",
    label: "History",
    href: "/human-resources/approvals",
    icon: FileCheck,
    categoryId: "approvals",
  },
];
