import {
  BarChart3,
  Building2,
  Calendar,
  CalendarCheck,
  ChartLine,
  Checklist,
  ClipboardList,
  Coins,
  Dashboard,
  Dataset,
  EventNote,
  Factory,
  FileCheck,
  FileText,
  Fuel,
  Funnel,
  Grid3x3,
  History,
  Home,
  Layers,
  LocalShipping,
  Mail,
  ManageAccounts,
  MapPin,
  MedusaAcademicCapIcon,
  MedusaBookOpenIcon,
  MedusaIdBadgeIcon,
  Megaphone,
  NoteAdd,
  Package,
  PackageCheck,
  Payments,
  Phone,
  Receipt,
  ReceiptLong,
  ReportProblem,
  Scale,
  Send,
  Certificate,
  Flag,
  GraduationCap,
  Lock,
  ShieldCheck,
  SignOut,
  Star,
  Timer,
  TableRows,
  TrendingUp,
  Upload,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  Work,
  Wrench,
  Zap,
  type LucideIcon,
} from "@/lib/icons";
import { PEOPLE_TABS } from "@/lib/people/tab-config";
import { PAYROLL_TABS } from "@/lib/payroll/tab-config";
import { hasRole, type UserRole } from "@/lib/roles";
import { RETAIL_NAV_ITEMS } from "@/lib/retail/nav";
import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import type { SchoolAction, SchoolResource } from "@/lib/schools/access";

// Who may reach People and Payroll at all. Mirrored as a Set in `proxy.ts`,
// which checks it on the route prefix before the page renders.
const WORKFORCE_MODULE_ALLOWED_ROLES: UserRole[] = ["SUPERADMIN", "MANAGER", "CLERK"];

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /**
   * Which group inside the section this belongs to. Items with no group render
   * first and unlabelled, which keeps every existing section rendering exactly
   * as it did.
   */
  group?: string;
  /**
   * The campus grant this destination needs, where it differs from its band's.
   *
   * A band's grant is a default, not a law. Health and welfare sits with the
   * roll and is `schools.welfare`; the calendar sits with the registers and is
   * not `schools.attendance`, because a bursar who keeps no register still has
   * to know whether the school is open. Writing the exception on the row is
   * what stops a band being split in two to say one true thing about one line.
   */
  grant?: SchoolNavGrant;
  /** Where this row sits in a `ranked` section. See `NavRank`. */
  rank?: NavRank;
  /**
   * Retail only: the grants that show this item, any of them
   * (00-foundations 5.3.4). Checked with `canRetailRoleDo`; the server still
   * refuses on its own, hiding is never the check.
   */
  requires?: Array<[RetailResource, RetailAction]>;
  /**
   * Matches its own path only, not the pages under it. A workspace's Overview
   * at its root (`/retail`) is not the parent of every page in the workspace.
   */
  exact?: boolean;
};

/**
 * Where a destination sits in a ranked section's list, after anything the
 * person pinned: the business's own work first, in the order that work moves
 * (a lead, then a deal, then a project), then the person's own pages, then
 * everything else A to Z.
 */
export type NavRank = "flow" | "own";

/** A campus resource and the verb asked of it. `view` unless stated. */
export type SchoolNavGrant = {
  resource: SchoolResource;
  action?: SchoolAction;
};

/**
 * A labelled band of related items inside a section.
 *
 * Only worth it once a section is long enough that a flat list stops being
 * scannable — a sixteen-item CRM reads as inventory rather than navigation.
 * A group whose items are all gated away disappears with them.
 */
export type NavGroup = {
  id: string;
  label: string;
  /** Where this group sits among its section's groups when it is `ranked`. */
  rank?: NavRank;
};

export type NavSection = {
  id: string;
  title: string;
  description?: string;
  featureKey?: string;
  /** Declares group order and labels. Groups with no visible items are dropped. */
  groups?: NavGroup[];
  /**
   * Render each group as its own root-level entry instead of as a band inside
   * this section. For a section whose title names a category rather than a
   * destination, the groups are the places people are actually going.
   */
  flattenGroups?: boolean;
  /**
   * Order the rail by `NavRank` rather than by declaration: pinned, then flow
   * in declared order, then own, then the rest A to Z. Applies to the groups
   * and to the rows inside each.
   */
  ranked?: boolean;
  items: NavItem[];
};

/**
 * The campus groups, each with the grant that decides whether it renders.
 *
 * The grant sits beside the label because the two have to name the same thing:
 * a group a persona cannot reach is a row of doors into a 403, and the only way
 * to keep that pairing honest is to write it once. `lib/workspaces.ts` reads it
 * when it assembles the school sidebar.
 *
 * Two of them ask for a working verb rather than `view`. Boarding and Fees
 * exist to be worked and one persona owns each outright; the question a reader
 * has — does this child board, has this family paid — is answered on the pupil
 * record, which is where the person asking it is already standing.
 */
type SchoolNavBand = NavGroup & SchoolNavGrant;

const SCHOOL_BANDS: SchoolNavBand[] = [
  { id: "students", label: "Students", resource: "schools.students" },
  { id: "school-day", label: "The school day", resource: "schools.attendance" },
  // Not `schools.academics`: that resource also covers the master-data ladder,
  // which the bursar reads all day, so gating oversight of classroom work on it
  // put lesson plans and subject targets in the bursar's rail. `schools.results`
  // is the grant that means "trusted with how children are doing".
  { id: "teaching", label: "Teaching", resource: "schools.results" },
  // S-12.1. After Teaching because the canvas puts Conduct straight after
  // Classroom, and for the same reason: what happened in a lesson is read by
  // whoever was standing in it, then by the office.
  //
  // `schools.conduct`, not `schools.students`: a behaviour record is not a
  // class list, and everybody who can see the roll should not be handed the
  // log. Pastoral notes are deliberately NOT in this group — see the row
  // beside Health and welfare.
  { id: "conduct", label: "Conduct", resource: "schools.conduct" },
  { id: "results", label: "Results", resource: "schools.results" },
  { id: "boarding", label: "Boarding", resource: "schools.boarding", action: "allocate-bed" },
  { id: "fees", label: "Fees", resource: "schools.fees", action: "issue" },
  // Not "People": the HR module's own rail is called that, and two entries of
  // one name pointing at different populations is a coin toss every time.
  { id: "staff", label: "Staff", resource: "schools.teachers" },
  { id: "families", label: "Families", resource: "schools.reports" },
  // `edit`, not `view`: the bursar, the head of department and the class
  // teacher read the ladder all day through other screens, and none of them
  // should be offered a door that lets them restructure the year.
  { id: "school", label: "The school", resource: "schools.academics", action: "edit" },
];

export function schoolBandGrant(groupId: string): SchoolNavGrant | null {
  const band = SCHOOL_BANDS.find((candidate) => candidate.id === groupId);
  return band ? { resource: band.resource, action: band.action } : null;
}

export const navSections: NavSection[] = [
  {
    id: "overview",
    title: "Start",
    items: [
      { href: "/", icon: Home, label: "Home" },
      { href: "/help", icon: FileText, label: "Help" },
    ],
  },
  {
    id: "daily",
    // Attendance left this section. Marking a register is not mining — a school,
    // a bureau and a workshop all keep one, and it is now People › Time ›
    // Attendance. What stays here is production reporting, which is.
    title: "Today",
    description: "Mining shift and plant capture",
    items: [
      {
        href: "/shift-report",
        icon: NoteAdd,
        label: "Shift report",
      },
      {
        href: "/plant-report",
        icon: Factory,
        label: "Plant report",
      },
    ],
  },
  {
    id: "reporting",
    title: "Reports",
    description: "The reports this workspace can run, for its own industry",
    // No feature of its own: every report is gated by the page it is about
    // (see lib/reports/access.ts), and the entry shows only when at least one
    // is readable (the reporting module in lib/workspaces.ts).
    items: [{ href: "/reports", icon: FileCheck, label: "Reports" }],
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
  {
    id: "maintenance",
    title: "Assets",
    description: "Equipment, work orders, scheduling",
    featureKey: "maintenance.dashboard",
    items: [
      { href: "/maintenance", icon: Dashboard, label: "Overview" },
      {
        href: "/maintenance/equipment",
        icon: Wrench,
        label: "Equipment",
      },
      {
        href: "/maintenance/work-orders",
        icon: Checklist,
        label: "Work Orders",
      },
      {
        href: "/maintenance/breakdown",
        icon: ReportProblem,
        label: "Log Breakdown",
      },
      { href: "/maintenance/schedule", icon: Calendar, label: "PM Schedule" },
    ],
  },
  {
    id: "stores",
    title: "Stock",
    description: "Inventory and fuel control",
    featureKey: "stores.dashboard",
    // Issuing and receiving left this list when they became dialogs — a write
    // action does not belong in a column of places to look.
    groups: [
      { id: "stock", label: "Stock" },
      { id: "selling", label: "What we sell" },
    ],
    items: [
      { href: "/stores/dashboard", icon: Dashboard, label: "Overview" },

      { href: "/stores/inventory", icon: Package, label: "On hand", group: "stock" },
      { href: "/stores/locations", icon: MapPin, label: "Locations", group: "stock" },
      { href: "/stores/movements", icon: History, label: "Movements", group: "stock" },
      { href: "/stores/fuel", icon: Fuel, label: "Fuel log", group: "stock" },

      { href: "/stores/catalogue", icon: TableRows, label: "Catalogue", group: "selling" },
      { href: "/stores/price-lists", icon: Scale, label: "Price lists", group: "selling" },
    ],
  },
  // ONE sidebar, not two.
  //
  // `flattenGroups` makes every group below a root-level entry that opens on
  // its own, so the campus nav *is* the sidebar rather than a second rail
  // hanging off a "School Operations" link. That only works if almost nothing
  // is left ungrouped, and two things are: the school's own front page, and the
  // reporting screen. Both are destinations rather than categories to expand,
  // and the workspace rail renders them as plain rows ahead of the groups.
  //
  // Nine groups, each named with a word a school uses about itself. The shell
  // register — Setup, Services, Communication, Paperwork — is gone, and with it
  // the bins those words licensed: "Services" was where Library and Transport
  // went because neither fitted anywhere else, but a loan belongs to a pupil
  // and a bus run belongs to a day, so each sits with its subject now.
  //
  // The group order is the order a school day touches them: who is here, what
  // is on today, what is being taught, what came of it, who is in tonight, what
  // is owed, who does the work, what has been said, and how it is all set up.
  // Checked against every persona, it never puts a group somebody works in
  // behind a group they only read.
  //
  // Nothing here is a second door onto a room already named. The fee ledger's
  // own tabs were five rail entries, publishing windows was a redirect to the
  // grading row six lines further down, and library loans was half of a
  // two-segment strip — ten rows advertising screens the rail had already
  // advertised. Each is reached from the screen it belongs to.
  //
  // Capture is deliberately absent. Writing a lesson plan, uploading a
  // resource and entering a mark are done in the teacher portal, because a
  // teacher does them and an administrator does not. What Teaching and Results
  // hold is the office's view of the same tables — who has not planned, who has
  // not marked, what is queried, what is ready to go out — which is a different
  // question and belongs to whoever is arranging cover.
  //
  // The academic ladder — years, terms, classes, subjects, the school day,
  // grading and what a record is made of — is master data and lives under
  // Management as a route. It is the school's own job, though, so The school
  // reaches across to it and nobody has to learn where it was filed.
  //
  // Every group shares `schools.core`, so a tenant without the module loses the
  // whole set rather than being left with empty headings.
  {
    id: "schools",
    title: "School Operations",
    description: "Full school management operations and portals",
    featureKey: "schools.core",
    flattenGroups: true,
    groups: SCHOOL_BANDS,
    // The group's own front page leads; everything else is alphabetical.
    //
    // Alphabetical is a decision, not a default: a school's nav is a reference
    // list, nobody reads it top to bottom, they look for a word they already
    // have in mind, and a hand-ordered band means scanning all of it to find
    // out the order was somebody's opinion. The one exemption is a group's own
    // front page, which is not one of its siblings.
    items: [
      { href: "/schools", icon: Building2, label: "Overview" },
      // "School reports", not "Reports": the reporting module's own section is
      // called that and can appear in the same rail. It stays a root link
      // because it is one screen drawn four ways, not a category to expand.
      {
        href: "/schools/reports",
        icon: BarChart3,
        label: "School reports",
        grant: { resource: "schools.reports" },
      },

      // Everything the office holds about a child: the record, the way in, the
      // family behind it, the medical file, and what the child has out of the
      // library.
      { href: "/schools/students", icon: Users, label: "Students", group: "students" },
      {
        href: "/schools/admissions",
        icon: NoteAdd,
        label: "Applications",
        group: "students",
        grant: { resource: "schools.admissions" },
      },
      { href: "/schools/guardians", icon: UserRound, label: "Guardians", group: "students" },
      // An allergy does not care whether a child sleeps at school. Gated as
      // boarding it was denied to the bursar, the head of department and the
      // class teacher, all of whom hold `schools.welfare` and all of whom may
      // be the one standing in front of the child.
      {
        href: "/schools/boarding/welfare",
        icon: ShieldCheck,
        label: "Health and welfare",
        group: "students",
        grant: { resource: "schools.welfare" },
      },
      // Filed beside the medical file rather than under Conduct, which is the
      // decision `13-campus-expansion-canvas.md` argues at length: "a pastoral
      // note is not a discipline record. Filing it under Conduct would have
      // told every person who opened the menu that it was." The canvas puts it
      // in a Welfare group with the bed board; this rail has no Welfare group —
      // Health and welfare sits here, with the pupil — so this is where the
      // argument lands. Its route is still `/schools/conduct/pastoral`; see
      // conduct.md open question 1.
      //
      // `schools.pastoral` is its own resource and the only row in the rail
      // that carries it, so a member of staff with no clearance never sees the
      // door. That is deliberate the other way too: the page itself answers
      // `NotYourJob` rather than 404 for somebody who holds the grant and no
      // clearance, because a nurse who cannot find the screen concludes the
      // feature does not exist.
      {
        href: "/schools/conduct/pastoral",
        icon: Lock,
        label: "Pastoral notes",
        group: "students",
        grant: { resource: "schools.pastoral" },
      },
      { href: "/schools/library", icon: MedusaBookOpenIcon, label: "Library", group: "students" },
      // S-13.4 and S-13.5, at the end of the group in the order of the year: a
      // pupil is admitted, taught, rolled up, and then leaves.
      {
        href: "/schools/leavers",
        icon: SignOut,
        label: "Leavers",
        group: "students",
        grant: { resource: "schools.leavers" },
      },
      {
        href: "/schools/alumni",
        icon: GraduationCap,
        label: "Alumni",
        group: "students",
        grant: { resource: "schools.alumni" },
      },

      // What is happening today and whether the school is open.
      { href: "/schools/attendance", icon: UserCheck, label: "Registers", group: "school-day" },
      // Oversight, not a register. An administrator arrives at the whole school
      // and narrows to a class; the class-by-class rail belongs to the page,
      // which is the only thing that knows tonight's classes.
      {
        href: "/schools/attendance/follow-up",
        icon: ReportProblem,
        label: "Absence follow-up",
        group: "school-day",
      },
      // Not `schools.academics`: the ladder under master data is where a year
      // and its terms are defined, and gating the calendar on it would deny the
      // warden the one screen that answers "are we open on Monday". Everybody
      // who can see the roll is responsible for a child on a day the school
      // may be closed.
      {
        href: "/schools/calendar",
        icon: Calendar,
        label: "Calendar",
        group: "school-day",
        grant: { resource: "schools.students" },
      },
      {
        href: "/schools/timetable",
        icon: Grid3x3,
        label: "Timetable",
        group: "school-day",
        grant: { resource: "schools.academics" },
      },
      // A bus run is the shape of a single day, and the screen's second half is
      // a register. Everybody who can see the roll can see who is on which bus.
      {
        href: "/schools/transport",
        icon: LocalShipping,
        label: "Transport",
        group: "school-day",
        grant: { resource: "schools.students" },
      },

      // The office's view of classroom work it does not do itself. The gate is
      // `schools.results` rather than `schools.academics`, which also covers
      // the master-data ladder and so is held by the bursar — who has no
      // business being offered lesson plans and subject targets.
      { href: "/schools/homework", icon: ClipboardList, label: "Homework", group: "teaching" },
      { href: "/schools/teaching/lessons", icon: EventNote, label: "Lesson plans", group: "teaching" },
      { href: "/schools/goals", icon: TrendingUp, label: "Subject targets", group: "teaching" },
      { href: "/schools/teaching/resources", icon: FileText, label: "Teaching resources", group: "teaching" },

      // A workflow, not a screen: a sheet is submitted, moderated, sent back or
      // approved, then published, and each of those is somebody different's
      // move. Separate from Teaching because the head of department signs in to
      // do exactly one thing and "Teaching" does not name it.
      // S-12.1. The log leads because it is the one a deputy head opens before
      // the bell; merits and detention are the two halves of what follows from
      // it.
      { href: "/schools/conduct", icon: Flag, label: "Behaviour log", group: "conduct" },
      {
        href: "/schools/conduct/detention",
        icon: Timer,
        label: "Detention",
        group: "conduct",
      },
      {
        href: "/schools/conduct/merits",
        icon: Star,
        label: "Merits and demerits",
        group: "conduct",
      },
      // The module does not start without this. An incident is logged against
      // a category and a merit is given for a reason; both lists begin empty
      // and the endpoints that fill them had no caller, so every conduct
      // screen opened onto a list nothing could add to.
      {
        href: "/schools/conduct/setup",
        icon: Scale,
        label: "Conduct setup",
        group: "conduct",
      },

      { href: "/schools/results", icon: FileCheck, label: "Results", group: "results" },
      // S-13.1. Public exams fold into Results rather than taking a group of
      // their own: "a head looking for November's grades does not first decide
      // whether they are internal or public."
      // Nothing in the module works without a board: a series is sat with one,
      // and the POST that creates one had no caller, so the whole of public
      // exams was unreachable from an empty tenant.
      {
        href: "/schools/exams/reference",
        icon: Scale,
        label: "Exam boards",
        group: "results",
      },
      {
        href: "/schools/exams",
        icon: Certificate,
        label: "Exam series",
        group: "results",
        grant: { resource: "schools.exams" },
      },
      { href: "/schools/results/moderation", icon: Scale, label: "Moderation", group: "results" },
      { href: "/schools/results/publish", icon: Send, label: "Publishing", group: "results" },

      // The house: where there is a free bed, who is in which bed, who is in
      // the building tonight, who is ill, and who is out of the gate.
      //
      // Roll call earns a rail entry rather than living inside a house,
      // because it is the one thing here that happens at a fixed time every
      // night and is the reason somebody opens this module at nine o'clock.
      { href: "/schools/boarding", icon: Home, label: "Bed board", group: "boarding" },
      { href: "/schools/boarding/allocations", icon: Checklist, label: "Allocations", group: "boarding" },
      { href: "/schools/boarding/roll-call", icon: UserCheck, label: "Roll call", group: "boarding" },
      // Houses is where boarding work starts — you pick a house, then read its
      // plan. It shipped with a record page, a 386-line list component and a
      // back link pointing at it, and no route file, so the list 404'd and the
      // component was orphaned. "Rooms and beds" is the same building from the
      // other end: where a dormitory is added and its beds are numbered.
      { href: "/schools/boarding/houses", icon: Home, label: "Houses", group: "boarding" },
      {
        href: "/schools/boarding/hostels",
        icon: Building2,
        label: "Rooms and beds",
        group: "boarding",
      },
      { href: "/schools/boarding/sick-bay", icon: MedusaIdBadgeIcon, label: "Sick bay", group: "boarding" },
      { href: "/schools/boarding/leave", icon: CalendarCheck, label: "Leave and outings", group: "boarding" },

      // Money owed to the school. Three entries where there were eight: five of
      // the eight were `?view=` links onto the ledger's own segmented control,
      // so the rail was four rows deep into a screen it had already named.
      { href: "/schools/finance", icon: ReceiptLong, label: "Fees by class", group: "fees" },
      { href: "/schools/finance/ledger", icon: Payments, label: "Fee ledger", group: "fees" },
      // Not a ledger segment. "Who owes, and for how long" is a different
      // question from "show me the invoices", with its own ageing strip and its
      // own primary action, and it is what a bursar opens first.
      { href: "/schools/finance/arrears", icon: ReportProblem, label: "Arrears and ageing", group: "fees" },

      // Everybody a school employs who does not teach — the bursar, the nurse,
      // the grounds team. They are HR employees carrying the SCHOOLS
      // assignment, so payroll and leave stay in one place; this is the
      // school's window onto its own.
      { href: "/schools/staff", icon: MedusaIdBadgeIcon, label: "Support staff", group: "staff" },
      { href: "/schools/teachers", icon: MedusaAcademicCapIcon, label: "Teaching staff", group: "staff" },

      // Everything that passes between the school and a home. A notice goes out
      // to many and cannot be replied to; a message is one family and one
      // member of staff; a meeting is a slot in somebody's evening; a document
      // is the thing you print and hand over. Keeping the four adjacent is how
      // somebody learns which one they wanted.
      { href: "/schools/documents", icon: FileText, label: "Documents", group: "families" },
      { href: "/schools/messages", icon: Mail, label: "Messages", group: "families" },
      { href: "/schools/notices", icon: Megaphone, label: "Notices", group: "families" },
      { href: "/schools/meetings", icon: CalendarCheck, label: "Parent meetings", group: "families" },

      // What the school is, as opposed to what it does — and because a school
      // arriving from another system brings its history with it, the import
      // screen. Each label is the thing being set up rather than the shell it
      // opens in, and the school day carries its rooms because periods and
      // rooms are the two axes of one timetable and `school-day-content` owns
      // both.
      {
        href: "/management/master-data/schools/classes",
        icon: Layers,
        label: "Classes and streams",
        group: "school",
      },
      {
        href: "/management/master-data/schools/grading",
        icon: Scale,
        label: "Grading and publish windows",
        group: "school",
      },
      { href: "/schools/imports", icon: Upload, label: "Import records", group: "school" },
      {
        href: "/management/master-data/schools/identity",
        icon: TableRows,
        label: "Records and identity",
        group: "school",
      },
      {
        href: "/management/master-data/schools/periods",
        icon: MapPin,
        label: "School day and rooms",
        group: "school",
      },
      {
        href: "/management/master-data/schools/subjects",
        icon: MedusaBookOpenIcon,
        label: "Subjects",
        group: "school",
      },
      {
        href: "/management/master-data/schools/years",
        icon: Dataset,
        label: "Years and terms",
        group: "school",
      },
    ],
  },
  {
    id: "retail",
    title: "Retail",
    description: "The floor, products, stock, buying, insights and management",
    featureKey: "retail.core",
    // Retail's nav items live one file per module in `lib/retail/nav/`
    // (00-foundations 5.3.4, 99-coverage 4.1 rule 4): every href a route that
    // exists, labelled and drawn as the canvas draws it, with `requires` as
    // the role visibility. The route registry still gates each path on the
    // tenant's features.
    items: RETAIL_NAV_ITEMS,
  },
  {
    // Retail's customer ledger, not the CRM module. It used to share the id
    // "crm" with it, and since section lookups are built from this array the
    // later entry silently won.
    id: "retail-customers",
    title: "Customers",
    description: "Customer profiles, loyalty, and ledgers",
    featureKey: "crm.customers",
    items: [
      { href: "/retail/customers", icon: Users, label: "Customers" },
    ],
  },
  {
    id: "gold",
    title: "Gold Operations",
    description: "Production, settlement, and control tasks",
    featureKey: "gold.home",
    items: [
      { href: "/gold", icon: Coins, label: "Overview" },
      {
        href: "/gold/intake/pours/new",
        icon: Dataset,
        label: "Pours",
      },
      {
        href: "/gold/intake/purchases/new",
        icon: Payments,
        label: "Purchases",
      },
      {
        href: "/gold/transit/dispatches/new",
        icon: LocalShipping,
        label: "Dispatches",
      },
      {
        href: "/gold/settlement/receipts/new",
        icon: ReceiptLong,
        label: "Settlements",
      },
      { href: "/gold/exceptions", icon: ReportProblem, label: "Exceptions" },
      { href: "/reports/gold-chain", icon: ChartLine, label: "Reports" },
    ],
  },
  // The CRM is not one thing you open, it is six. A single parent entry meant
  // every route inside it cost two clicks and hid behind a word — "CRM" — that
  // names a category rather than a place. Its groups are root entries now,
  // each expanding to its own children, which is how the reference works and
  // how anybody actually describes where they are going: "the pipeline",
  // "records", "the paperwork".
  //
  // They share `crm.core`, so a tenant without the module loses the whole set
  // rather than being left with six empty headings.
  {
    id: "crm",
    title: "CRM",
    description: "Leads, clients, site visits, and sales pipeline",
    featureKey: "crm.core",
    // Rendered flat: each group below becomes its own root entry in the
    // sidebar rather than a band inside a "CRM" parent. "CRM" names a category,
    // not a place — nobody says "I'm going to CRM", they say "the pipeline" or
    // "the paperwork", and burying six of those behind one word cost a click
    // each and told you nothing on the way past.
    flattenGroups: true,
    ranked: true,
    // One group per question somebody opens the CRM to answer. What is in
    // the pipeline? Who are we dealing with? What is on today? What are we
    // delivering? Where did the money go? What have we billed? Who is on the
    // team? A group that answered two of those — leads beside the team list
    // under "Pipeline" — was one nobody could find anything in.
    //
    // Ranked: the rail reads pinned first, then the groups the business's
    // work moves through (flow) in the order declared here, then the
    // person's own (own), then the rest A to Z.
    groups: [
      // Selling: the leads, the deals they turn into, and the forms that
      // bring leads in.
      { id: "pipeline", label: "Pipeline", rank: "flow" },
      // Who we deal with, outside the business.
      { id: "contacts", label: "Contacts", rank: "flow" },
      // What is on today: the tasks, visits and calls somebody owes.
      { id: "work", label: "Work", rank: "own" },
      // Delivery: what a won deal turns into, and the jobs inside it. Its own
      // group rather than two lines under Work, because a project is a place
      // people go to — its jobs, its money, its team — not another queue of
      // things to do today.
      { id: "projects", label: "Projects", rank: "flow" },
      // The money that moves through people's hands, as opposed to the
      // paperwork that asks for it: the float a rep draws, what they spent it
      // on, what they collected, and each day's report. Quotes and invoices
      // are Billing.
      { id: "money", label: "Finance", rank: "flow" },
      { id: "documents", label: "Billing", rank: "flow" },
      // The people inside the business, and your own page among them.
      { id: "team", label: "Team", rank: "own" },
      { id: "learn", label: "Insights" },
      // How the CRM is set up, and what it does by itself once it is: the
      // workflows are configuration, and a group of their own was the mark
      // that pushed the rail past ten and collapsed every group into one list.
      { id: "setup", label: "Setup" },
    ],
    items: [
      // "Home", not "Overview": it is where the day starts, and the CRM's one
      // page with no subject of its own — every other row names what it holds.
      { href: "/crm", icon: Home, label: "Home" },

      { href: "/crm/leads", icon: Funnel, label: "Leads", group: "pipeline", rank: "flow" },
      { href: "/crm/deals", icon: Funnel, label: "Deals", group: "pipeline", rank: "flow" },
      { href: "/crm/forms", icon: NoteAdd, label: "Intake forms", group: "pipeline" },

      { href: "/crm/people", icon: Users, label: "People", group: "contacts" },
      { href: "/crm/companies", icon: Building2, label: "Companies", group: "contacts" },
      { href: "/crm/sites", icon: MapPin, label: "Sites", group: "contacts" },

      { href: "/crm/reps", icon: UserRound, label: "Team", group: "team" },
      // Whoever is signed in: `/crm/reps/me` redirects to their own page,
      // which is how they are doing — what they won, finished and collected.
      { href: "/crm/reps/me", icon: UserCheck, label: "My performance", group: "team", rank: "own" },

      { href: "/crm/tasks", icon: Checklist, label: "Tasks", group: "work" },
      { href: "/crm/appointments", icon: CalendarCheck, label: "Site visits", group: "work", rank: "flow" },
      { href: "/crm/follow-ups", icon: Phone, label: "Follow-ups", group: "work" },

      // A project is what a won deal turns into, and somebody is answerable
      // for what it costs. Jobs sit under it because that is where they are
      // raised; a job is still labelled "Jobs" because that is what the page,
      // the button and everybody in the building already call it.
      { href: "/crm/projects", icon: Work, label: "Projects", group: "projects", rank: "flow" },
      { href: "/crm/work-orders", icon: Wrench, label: "Jobs", group: "projects", rank: "flow" },

      {
        href: "/crm/finance",
        icon: Dashboard,
        // What the page answers, not what kind of page it is: "overview" on
        // three rows said nothing about any of them.
        label: "Money in and out",
        roles: ["SUPERADMIN", "MANAGER", "FINANCE_OFFICER"],
        group: "money",
        rank: "flow",
      },
      // In the order the money moves: asked for, spent, reported.
      { href: "/crm/requisitions", icon: Wallet, label: "Requisitions", group: "money", rank: "flow" },
      { href: "/crm/cost-tracker", icon: Receipt, label: "Cost tracker", group: "money", rank: "flow" },
      {
        href: "/crm/daily-reports",
        icon: Coins,
        label: "Daily reports",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "money",
        rank: "flow",
      },

      { href: "/crm/quotes", icon: FileText, label: "Quotes", group: "documents", rank: "flow" },
      { href: "/crm/invoices", icon: ReceiptLong, label: "Invoices", group: "documents", rank: "flow" },
      { href: "/crm/receipts", icon: Payments, label: "Receipts", group: "documents", rank: "flow" },
      { href: "/crm/collections", icon: Scale, label: "Collections", group: "documents", rank: "flow" },

      { href: "/crm/insights", icon: BarChart3, label: "Insights", group: "learn" },
      { href: "/crm/reports", icon: ChartLine, label: "Sales reports", group: "learn" },

      {
        href: "/crm/workflows",
        icon: Zap,
        label: "Workflows",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "setup",
      },
      {
        href: "/crm/workflows/runs",
        icon: History,
        label: "Workflow activity",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "setup",
      },

      { href: "/crm/import", icon: Upload, label: "Import", group: "setup" },
      {
        href: "/crm/settings/site-visit-questions",
        icon: Checklist,
        label: "Site visit questions",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "setup",
      },
      {
        href: "/crm/settings",
        icon: ManageAccounts,
        label: "Settings",
        roles: ["SUPERADMIN", "MANAGER"],
        group: "setup",
      },
    ],
  },
  {
    id: "accounting",
    title: "Accounting",
    description: "Ledger, journals, and finance controls",
    featureKey: "accounting.core",
    items: [
      { href: "/accounting", icon: Scale, label: "Overview" },
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
        href: "/dashboard",
        icon: Dashboard,
        label: "Dashboard",
        roles: ["SUPERADMIN", "MANAGER"],
      },
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
        label: "Management",
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
