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

export type HrTabItem = {
  id: HrTab;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const HR_TABS: HrTabItem[] = [
  { id: "employees", label: "Employees", href: "/human-resources", icon: ManageAccounts },
  { id: "shift-groups", label: "Shift Groups", href: "/human-resources/shift-groups", icon: Users },
  { id: "incidents", label: "Workforce Incidents", href: "/human-resources/incidents", icon: ShieldCheck },
  { id: "payouts", label: "Settlements", href: "/human-resources/payouts", icon: Coins },
  {
    id: "compensation",
    label: "Compensation Rules",
    href: "/human-resources/compensation",
    icon: UserRound,
  },
  { id: "salaries", label: "Salaries", href: "/human-resources/salaries", icon: Payments },
  {
    id: "salary-outstanding",
    label: "Outstanding Salaries",
    href: "/human-resources/salaries/outstanding",
    icon: Wallet,
  },
  { id: "payroll", label: "Payroll Runs", href: "/human-resources/payroll", icon: Checklist },
  { id: "disbursements", label: "Disbursements", href: "/human-resources/disbursements", icon: Wallet },
  { id: "approvals", label: "Approval History", href: "/human-resources/approvals", icon: FileCheck },
];
