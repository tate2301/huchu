import {
  MapPin,
  BarChart3,
  Building2,
  CalendarCheck,
  Calendar,
  Checklist,
  ClipboardList,
  Coins,
  Dataset,
  EventNote,
  FileCheck,
  FileText,
  Layers,
  Mail,
  MedusaBookOpenIcon,
  Receipt,
  History,
  LocalShipping,
  ManageAccounts,
  NoteAdd,
  ReceiptLong,
  ReportProblem,
  TableRows,
  TrendingUp,
  Home,
  PackageCheck,
  ShieldCheck,
  Scale,
  Upload,
  UserRound,
  Users,
  UserCheck,
  Wallet,
  Payments,
} from "@corelithzw/ui/lib/icons";
import { PEOPLE_TABS } from "@corelithzw/module-people/people/tab-config";
import { PAYROLL_TABS } from "@corelithzw/module-people/payroll/tab-config";
import { hasRole, type UserRole } from "@corelithzw/platform/roles";

// Who may reach People and Payroll at all; the proxy checks it on the prefix
// from the people module's manifest.
const WORKFORCE_MODULE_ALLOWED_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "CLERK"];

import type { NavGroup, NavItem, NavSection } from "@corelithzw/shell/navigation";

export type { NavGroup, NavItem, NavSection };

export const navSections: NavSection[] = [
  {
    id: "overview",
    title: "Start",
    items: [
      { href: "/", icon: Home, label: "Home" },
      { href: "/help", icon: FileText, label: "Quick Tips" },
    ],
  },
  {
    id: "reporting",
    title: "Reports",
    description: "Open report pages across operations",
    featureKey: "reports.dashboard",
    items: [
      { href: "/reports/attendance", icon: Checklist, label: "Attendance" },
      {
        href: "/reports/compliance-incidents",
        icon: ShieldCheck,
        label: "Incidents",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "people",
    title: "People",
    description: "Employee records, rosters and workforce history",
    featureKey: "hr.employees",
    items: PEOPLE_TABS.map((tab) => ({
      href: tab.href,
      icon: tab.icon,
      label: tab.label,
      roles: WORKFORCE_MODULE_ALLOWED_ROLES,
    })),
  },
  {
    id: "payroll",
    title: "Payroll",
    description: "Compensation, month-end runs and statutory returns",
    featureKey: "hr.payroll",
    items: PAYROLL_TABS.map((tab) => ({
      href: tab.href,
      icon: tab.icon,
      label: tab.label,
      // Compensation rules set what everybody is paid, so they stay with the
      // people who can approve a run rather than the clerk who prepares one.
      roles:
        tab.categoryId === "compensation"
          ? ["SUPERADMIN", "MANAGER"]
          : WORKFORCE_MODULE_ALLOWED_ROLES,
    })),
  },
  // ONE sidebar, not two.
  //
  // `flattenGroups` makes every group below a root-level entry that opens on
  // its own, so the campus nav *is* the sidebar rather than a second rail
  // hanging off a "School Operations" link. That only works if almost nothing
  // is left ungrouped: eleven loose items used to render as a flat wall of
  // links beside the groups, which is what made it read as two navigations.
  // Overview is the single exception, because an overview is a destination and
  // not a category to expand.
  //
  // The bands are the jobs people come here to do, in the order a school day
  // touches them — who is on the roll, who is in tonight, what is being taught,
  // what was marked, what is owed, what is lent, what has been said, what gets
  // printed. A registrar, a bursar, a boarding master and an examinations
  // officer each own one band and can ignore the rest.
  //
  // Classroom work is deliberately absent. Lesson plans, teaching resources,
  // the scheme of work and mark capture live in the teacher portal, because a
  // teacher does them and an administrator does not. The office keeps
  // oversight — who has not marked, moderation, publishing — which is a
  // different question asked of the same tables.
  //
  // The academic ladder is absent for a different reason: years, terms,
  // classes, subjects, periods and grading are master data and live under
  // Management. Two entries reach across to them — "Identity and records" and
  // "Academic setup" — so nobody has to know they moved.
  //
  // Every group shares `schools.core`, so a tenant without the module loses the
  // whole set rather than being left with empty headings.
  {
    id: "schools",
    title: "School Operations",
    description: "Full school management operations and portals",
    featureKey: "schools.core",
    flattenGroups: true,
    groups: [
      { id: "students", label: "Students" },
      { id: "attendance", label: "Attendance" },
      { id: "academics", label: "Academics" },
      { id: "teaching", label: "Teaching" },
      { id: "results", label: "Results" },
      { id: "boarding", label: "Boarding" },
      { id: "fees", label: "Fees" },
      { id: "people", label: "People" },
      { id: "communication", label: "Communication" },
      { id: "services", label: "Services" },
      { id: "paperwork", label: "Reports and documents" },
    ],
    // Alphabetical within every band. A school's nav is a reference list, not a
    // narrative: nobody reads it top to bottom, they look for a word they
    // already have in mind, and a hand-ordered band means scanning all of it to
    // find out the order was somebody's opinion. The only item exempt is an
    // "Overview" — a band's own front page is not one of its siblings.
    items: [
      { href: "/schools", icon: Building2, label: "Overview" },

      // The roll and everything that changes it.
      { href: "/schools/admissions", icon: NoteAdd, label: "Applications", group: "students" },
      { href: "/schools/imports", icon: Upload, label: "Import records", group: "students" },
      { href: "/schools/students/roll-up", icon: History, label: "Roll up the year", group: "students" },
      { href: "/schools/students", icon: Users, label: "Students", group: "students" },

      // Oversight, not a register. An administrator arrives at the whole school
      // and narrows to a class; the class-by-class rail belongs to the page,
      // which is the only thing that knows tonight's year groups.
      { href: "/schools/attendance/follow-up", icon: ReportProblem, label: "Absence follow-up", group: "attendance" },
      { href: "/schools/attendance", icon: UserCheck, label: "Whole school", group: "attendance" },

      // Years, terms, classes, subjects, periods and grading are master data and
      // live under Management. These reach across so nobody has to know that.
      {
        href: "/management/master-data/schools/years",
        icon: Dataset,
        label: "Academic setup",
        group: "academics",
      },
      { href: "/schools/calendar", icon: Calendar, label: "Calendar", group: "academics" },
      {
        href: "/management/master-data/schools/identity",
        icon: TableRows,
        label: "Identity and records",
        group: "academics",
      },
      // Rooms are one half of `school-day-content` — the periods a day is cut
      // into, and the rooms lessons run in, which are the two axes of the same
      // timetable. Pointing at the tab beats a second rooms screen that would
      // drift from it.
      {
        href: "/management/master-data/schools/periods?view=rooms",
        icon: MapPin,
        label: "Rooms",
        group: "academics",
      },
      { href: "/schools/academics/syllabus", icon: Layers, label: "Scheme of work", group: "academics" },

      { href: "/schools/homework", icon: ClipboardList, label: "Homework", group: "teaching" },
      { href: "/schools/teaching/lessons", icon: MedusaBookOpenIcon, label: "Lesson plans", group: "teaching" },
      { href: "/schools/goals", icon: TrendingUp, label: "Subject targets", group: "teaching" },
      { href: "/schools/teaching/resources", icon: FileText, label: "Teaching resources", group: "teaching" },
      { href: "/schools/timetable", icon: Calendar, label: "Timetable", group: "teaching" },

      // A workflow, not a screen: a sheet is submitted, moderated, sent back or
      // approved, then published, and each of those is somebody different's move.
      { href: "/schools/results", icon: FileCheck, label: "Overview", group: "results" },
      { href: "/schools/results/moderation", icon: Scale, label: "Moderation", group: "results" },
      { href: "/schools/results/publish", icon: FileCheck, label: "Publishing", group: "results" },
      { href: "/schools/results/publish/windows", icon: Calendar, label: "Publishing windows", group: "results" },
      { href: "/schools/results/sheets", icon: Checklist, label: "Result sheets", group: "results" },

      { href: "/schools/boarding/allocations", icon: Checklist, label: "Allocations", group: "boarding" },
      { href: "/schools/boarding", icon: Home, label: "Bed board", group: "boarding" },
      { href: "/schools/boarding/welfare", icon: ShieldCheck, label: "Health and welfare", group: "boarding" },
      { href: "/schools/boarding/hostels", icon: Building2, label: "Hostels", group: "boarding" },
      { href: "/schools/boarding/leave", icon: CalendarCheck, label: "Leave and outings", group: "boarding" },

      // Each ledger label opens the ledger on the tab it names. They used to be
      // routes of their own that redirected to the year-group PICKER, so
      // "Waivers" landed a bursar on a grid of class cards — three labels
      // pointing at a fourth screen. One ledger, one tab per label.
      { href: "/schools/finance/arrears", icon: ReportProblem, label: "Arrears and ageing", group: "fees" },
      { href: "/schools/finance/ledger?view=credits", icon: Coins, label: "Credits on account", group: "fees" },
      { href: "/schools/finance", icon: ReceiptLong, label: "Fees by year group", group: "fees" },
      { href: "/schools/finance/ledger?view=invoices", icon: Receipt, label: "Invoices", group: "fees" },
      { href: "/schools/finance/ledger", icon: Payments, label: "Ledger and structures", group: "fees" },
      { href: "/schools/finance/ledger?view=receipts", icon: ReceiptLong, label: "Receipts", group: "fees" },
      { href: "/schools/finance/ledger?view=refunds", icon: Wallet, label: "Refunds", group: "fees" },
      { href: "/schools/finance/ledger?view=waivers", icon: Scale, label: "Waivers", group: "fees" },

      { href: "/schools/guardians", icon: UserRound, label: "Guardians", group: "people" },
      { href: "/schools/teachers/assignments", icon: Checklist, label: "Staff assignments", group: "people" },
      // Everybody a school employs who does not teach — the bursar, the nurse,
      // the grounds team. They are HR employees carrying the SCHOOLS
      // assignment, so payroll and leave stay in one place; this is the
      // school's window onto its own.
      { href: "/schools/staff", icon: ManageAccounts, label: "Support staff", group: "people" },
      { href: "/schools/teachers", icon: ManageAccounts, label: "Teaching staff", group: "people" },

      // What the school has said, and what has been said to it. A notice goes
      // out to many and cannot be replied to; a message is one family and one
      // member of staff. Keeping them adjacent is how somebody learns which
      // one they wanted.
      { href: "/schools/messages", icon: Mail, label: "Messages", group: "communication" },
      { href: "/schools/notices", icon: EventNote, label: "Notices", group: "communication" },
      { href: "/schools/meetings", icon: CalendarCheck, label: "Parent meetings", group: "communication" },

      { href: "/schools/library", icon: Dataset, label: "Library", group: "services" },
      { href: "/schools/library/loans", icon: MedusaBookOpenIcon, label: "Library loans", group: "services" },
      { href: "/schools/transport", icon: LocalShipping, label: "Transport", group: "services" },

      { href: "/schools/documents", icon: FileText, label: "Documents", group: "paperwork" },
      { href: "/schools/reports", icon: BarChart3, label: "School reports", group: "paperwork" },
    ],
  },
  {
    id: "accounting",
    title: "Accounting",
    description: "Ledger, journals, and finance controls",
    featureKey: "accounting.core",
    items: [
      { href: "/accounting", icon: Scale, label: "Accounting Overview" },
      { href: "/accounting/receivables", icon: ReceiptLong, label: "Receivables" },
      { href: "/accounting/payables", icon: PackageCheck, label: "Payables" },
      { href: "/accounting/financial-reports", icon: BarChart3, label: "Financial Reports" },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    description: "Organisation settings and administration",
    items: [
      {
        href: "/compliance",
        icon: ShieldCheck,
        label: "Compliance",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/preferences/organization/users",
        icon: UserRound,
        label: "Users",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/management/master-data",
        icon: TableRows,
        label: "Master Data",
        roles: ["SUPERADMIN", "MANAGER"],
      },
      {
        href: "/preferences/organization/branding/identity",
        icon: Building2,
        label: "Branding",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "templates",
    title: "Templates",
    description: "Every form, quote layout and document the company sends",
    items: [
      {
        href: "/templates",
        icon: FileText,
        label: "Templates",
        roles: ["SUPERADMIN", "MANAGER"],
      },
    ],
  },
];

export function getNavSectionsForRole(role: string | null | undefined) {
  return navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        item.roles ? hasRole(role, item.roles) : true,
      ),
    }))
    .filter((section) => section.items.length > 0);
}
