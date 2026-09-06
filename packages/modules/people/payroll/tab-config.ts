import {
  Checklist,
  Coins,
  FileCheck,
  Payments,
  ShieldCheck,
  UserRound,
  Wallet,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";

/**
 * Payroll — paying people for a period of employment.
 *
 * Its own module rather than four categories inside People. Everything here is
 * money and everything here shares a period: a compensation rule is what a run
 * will apply, a disbursement is that run leaving the bank, and a P2 is what the
 * state is told about it. None of that belongs next to an employee's next of kin.
 *
 * Statutory stays a separate category rather than tabs under Month end, because
 * these are the screens an accountant opens and the run screens are the clerk's —
 * and the permission matrix in `lib/hr/permissions.ts` already draws that line,
 * giving CLERK read-only access to a PAYE table it lets them prepare a run from.
 */

export type PayrollTab =
  | "compensation"
  | "salaries"
  | "salary-outstanding"
  | "runs"
  | "disbursements"
  | "statutory-tables"
  | "statutory-returns";

export type PayrollCategoryId = "compensation" | "month-end" | "statutory";

export type PayrollCategory = {
  id: PayrollCategoryId;
  label: string;
  icon: LucideIcon;
  order: number;
};

export const PAYROLL_CATEGORIES: PayrollCategory[] = [
  { id: "compensation", label: "Compensation", icon: UserRound, order: 1 },
  { id: "month-end", label: "Month end", icon: Coins, order: 2 },
  { id: "statutory", label: "Statutory", icon: ShieldCheck, order: 3 },
];

export type PayrollTabItem = {
  id: PayrollTab;
  label: string;
  href: string;
  icon: LucideIcon;
  categoryId: PayrollCategoryId;
};

export const PAYROLL_TABS: PayrollTabItem[] = [
  {
    id: "compensation",
    label: "Rules",
    href: "/payroll/compensation",
    icon: UserRound,
    categoryId: "compensation",
  },
  {
    id: "salaries",
    label: "Salaries",
    href: "/payroll/salaries",
    icon: Payments,
    categoryId: "compensation",
  },
  {
    id: "salary-outstanding",
    label: "Outstanding",
    href: "/payroll/salaries/outstanding",
    icon: Wallet,
    categoryId: "compensation",
  },
  {
    id: "runs",
    label: "Runs",
    href: "/payroll/runs",
    icon: Checklist,
    categoryId: "month-end",
  },
  {
    id: "disbursements",
    label: "Disbursements",
    href: "/payroll/disbursements",
    icon: Wallet,
    categoryId: "month-end",
  },
  {
    id: "statutory-tables",
    label: "Tables & Rates",
    href: "/payroll/statutory",
    icon: Checklist,
    categoryId: "statutory",
  },
  {
    id: "statutory-returns",
    label: "Returns",
    href: "/payroll/statutory/returns",
    icon: FileCheck,
    categoryId: "statutory",
  },
];
