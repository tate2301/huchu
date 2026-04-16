import {
  Building2,
  Camera,
  Coins,
  Dashboard,
  Gem,
  ReceiptLong,
  Recycle,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "@/lib/icons";

export const marketingNavItems = [
  { label: "Product", href: "/home/product" },
  { label: "Solutions", href: "/home/solutions" },
  { label: "Pricing", href: "/home/pricing" },
  { label: "Demo", href: "/home/book-demo" },
];

export const marketingSiteHighlights = ["Replace scattered tools", "Keep every site aligned", "Grow without switching systems"];

export const proofStats = [
  { label: "Start with one site and expand when ready", value: "1 -> many" },
  { label: "Give each team the view they actually need", value: "Role-based" },
  { label: "Track daily work, approvals, and reporting together", value: "Shared view" },
  { label: "Roll out in stages without replacing everything", value: "Phase by phase" },
];

export const valuePillars: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: ShieldCheck,
    title: "Clearer day-to-day control",
    description: "See what is happening across sites, teams, and tasks without chasing updates in separate tools.",
  },
  {
    icon: Coins,
    title: "Tighter cash and stock discipline",
    description: "Keep the work that affects stock, purchasing, payouts, and reporting connected in one system.",
  },
  {
    icon: Dashboard,
    title: "Reporting people can trust",
    description: "Managers get a clearer picture because sites, approvals, and records follow the same flow.",
  },
  {
    icon: Users,
    title: "A setup that grows with you",
    description: "Start with the part of the business causing the most friction, then add more as the team expands.",
  },
];

export const showcaseCards = [
  {
    eyebrow: "Retail and branch teams",
    title: "Keep stock, cash-up, and purchasing from drifting apart.",
    copy: "Stores, branch teams, and supervisors can follow the same process instead of patching together tills, spreadsheets, and chat updates.",
    chips: ["Stock", "Cash-up", "Purchasing", "Approvals"],
  },
  {
    eyebrow: "Schools and service operations",
    title: "Run admin, finance, and day-to-day work from the same record.",
    copy: "Attendance, fees, notices, jobs, or service handoffs stay easier to manage when teams are not duplicating information.",
    chips: ["Attendance", "Fees", "Jobs", "Notices"],
  },
  {
    eyebrow: "Controlled operations",
    title: "Track sensitive workflows with a clearer chain of responsibility.",
    copy: "For buying, dispatch, receipts, settlements, and other high-control work, teams get a single trail instead of disconnected handoffs.",
    chips: ["Dispatch", "Receipts", "Settlements", "Audit trail"],
  },
];

export const productSteps = [
  "Start with the workflow causing the most delays, mistakes, or follow-up work.",
  "Bring sites, teams, approvals, and reporting into one shared process.",
  "Add more locations, controls, and workflows as the business grows.",
];

export const productFeatureCards = [
  {
    eyebrow: "One place to work",
    title: "Daily activity stops living in spreadsheets, chat threads, and separate apps.",
    copy: "Teams can follow the work from start to finish without re-entering the same details in multiple places.",
  },
  {
    eyebrow: "Views for each role",
    title: "Managers, cashiers, supervisors, teachers, or admins see what matters to them.",
    copy: "Each team gets a clearer workspace instead of one crowded screen for everyone.",
  },
  {
    eyebrow: "Connected records",
    title: "Approvals, stock, money, and reporting stay tied to the same flow.",
    copy: "That means fewer gaps between what happened on the ground and what leadership sees later.",
  },
  {
    eyebrow: "Room to grow",
    title: "You can roll out in stages instead of replacing everything at once.",
    copy: "Start where the pressure is highest, then expand to more teams, sites, and controls when you are ready.",
  },
];

export const productControlMap = [
  {
    title: "Before",
    copy: "Teams rely on spreadsheets, WhatsApp updates, and disconnected tools that never quite match.",
  },
  {
    title: "After",
    copy: "The work, approvals, stock movements, and reports live in one shared system with clearer ownership.",
  },
  {
    title: "Why it matters",
    copy: "You spend less time chasing updates, fixing avoidable mistakes, and rebuilding reports by hand.",
  },
];

export const buyerPainCards = [
  {
    title: "No one is working from the same numbers",
    description: "Branches, teams, and managers each keep their own version of the truth, so small issues take longer to spot.",
  },
  {
    title: "Approvals and follow-ups get buried in chat",
    description: "Important work lives in messages, phone calls, and memory instead of a process people can actually track.",
  },
  {
    title: "Reporting depends on chasing people",
    description: "You only get a clean picture after asking around, stitching files together, and checking what changed.",
  },
];

export const customerOutcomeCards = [
  {
    title: "See what each site is doing",
    description: "Know what has been completed, what is waiting, and where something needs attention without digging through separate tools.",
  },
  {
    title: "Run cleaner handoffs",
    description: "Teams can pass work between locations, roles, and managers with less confusion and fewer missed steps.",
  },
  {
    title: "Get clearer reporting faster",
    description: "Because the work is captured in one place, your numbers and summaries are easier to trust.",
  },
];

export const solutionStories = [
  {
    eyebrow: "Gold operations",
    title: "Track intake to settlement without changing systems.",
    copy: "Purchases, dispatches, receipts, payouts, and audit trails stay in one control plane.",
    signal: "When cash, production, and settlement cannot drift.",
    points: ["Chain of custody", "Payout control", "Audit trail"],
    outcomes: ["One trail from intake to receipt", "Exceptions tied to finance"],
    start: "Purchasing, dispatches, receipts.",
    expand: "Gold advanced, finance, compliance.",
  },
  {
    eyebrow: "Schools",
    title: "Run admissions, finance, and portals from one record set.",
    copy: "Attendance, fees, notices, results, and boarding stay anchored to one student record.",
    signal: "When parent, student, and staff views must stay in sync.",
    points: ["Admissions to results", "Role-based portals", "Fee and boarding controls"],
    outcomes: ["Cleaner academic and finance handoffs", "No duplicate entry"],
    start: "Admissions, attendance, fees.",
    expand: "Boarding, results, reporting.",
  },
  {
    eyebrow: "Retail and POS",
    title: "Keep pricing, purchasing, and cash-up in one rhythm.",
    copy: "Catalog changes, refunds, stock movements, and shift close stay together.",
    signal: "When the same team owns tills, inventory, and closeout.",
    points: ["Shift close", "Stock control", "Refunds"],
    outcomes: ["Clarity at the till", "Tighter cash-up control"],
    start: "Catalog, POS, purchasing.",
    expand: "Accounting, maintenance, promotions.",
  },
  {
    eyebrow: "Platform admin",
    title: "Operate the SaaS business inside the product.",
    copy: "Companies, subscriptions, add-ons, support access, and health checks stay first-class.",
    signal: "When the platform itself needs governance.",
    points: ["Subscriptions and entitlements", "Scoped support", "Health and audit surfaces"],
    outcomes: ["One control plane for operators", "Commercial and support context together"],
    start: "Companies, subscriptions, support.",
    expand: "Features, reliability, controls.",
  },
];

export const verticalCards: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Gem,
    title: "Gold operations",
    description: "Track buying, dispatch, receipts, settlements, and reporting in one place when control cannot be loose.",
  },
  {
    icon: Recycle,
    title: "Scrap and recycling",
    description: "Keep yard stock, buying, pricing, and bulk sales easier to follow across teams and locations.",
  },
  {
    icon: Building2,
    title: "Schools",
    description: "Bring admissions, attendance, fees, notices, and portals into one system instead of separate admin tools.",
  },
  {
    icon: Users,
    title: "Auto sales",
    description: "See leads, stock, deal progress, and financing handoffs without losing track between departments.",
  },
  {
    icon: ReceiptLong,
    title: "Retail and POS",
    description: "Keep catalog, pricing, receiving, refunds, shift close, and stock control working from the same process.",
  },
  {
    icon: Camera,
    title: "Multi-site operations",
    description: "Bring people, stock, maintenance, CCTV, and reporting together as the business expands beyond one site.",
  },
];

export const pricingTiers = [
  {
    tier: "Basic",
    price: "$450",
    sites: "1 site included",
    extraSite: "$90 / extra site",
    stage: "Get your first site organised",
    bestFor: "Single-site teams.",
    summary: "A simple starting point for one location or one focused workflow.",
    detail: "Best when you want to replace manual tracking without taking on too much at once.",
  },
  {
    tier: "Standard",
    price: "$900",
    sites: "3 sites included",
    extraSite: "$140 / extra site",
    stage: "Bring growing locations together",
    bestFor: "Growing multi-site teams.",
    summary: "For businesses adding branches, managers, and more day-to-day handoffs.",
    detail: "A strong fit when separate sites need the same process and clearer reporting.",
  },
  {
    tier: "Enterprise",
    price: "$1,800",
    sites: "8 sites included",
    extraSite: "$220 / extra site",
    stage: "Run a broader operation with tighter oversight",
    bestFor: "Larger groups.",
    summary: "For larger groups that need stronger oversight across more sites and workflows.",
    detail: "Built for broader governance, deeper controls, and phased rollout at scale.",
  },
];

export const pricingConfidencePoints = [
  "3 tiers with site math",
  "20 add-on bundles",
  "USD pricing",
];

export const pricingSelectionNotes = [
  "Start with the pain point.",
  "Add sites explicitly.",
  "Add depth after baseline.",
];

export const addOns = [
  "Accounting Core",
  "Accounting Advanced",
  "Gold Advanced",
  "Schools Suite",
  "Retail Suite",
  "Auto Sales Suite",
  "Scrap Metal Suite",
  "CCTV Suite",
  "Maintenance Pro",
  "Compliance Pro",
  "Custom Branding",
  "Portal Suite",
];

export const featuredAddOns = [
  {
    name: "Accounting Core",
    price: "$250/mo",
    note: "Posting-aware finance controls.",
  },
  {
    name: "Accounting Advanced",
    price: "$350/mo",
    note: "AR, AP, banking, budgets, FX.",
  },
  {
    name: "Gold Advanced",
    price: "$220/mo",
    note: "Reconciliation, audit, payouts.",
  },
  {
    name: "Schools Suite",
    price: "$320/mo",
    note: "Student, fee, boarding, portal.",
  },
  {
    name: "Compliance Pro",
    price: "$200/mo",
    note: "Permits, inspections, training.",
  },
  {
    name: "Maintenance Pro",
    price: "$180/mo",
    note: "Equipment, work orders, breakdowns.",
  },
];

export const rolloutPaths = [
  {
    title: "Retail and branch rollout",
    start: "POS, stock, sales control, and shift close.",
    expand: "Purchasing, accounting, maintenance, and deeper reporting.",
  },
  {
    title: "School or service rollout",
    start: "Admissions, attendance, fees, notices, or service jobs.",
    expand: "Portals, reporting, branding, and accounting.",
  },
  {
    title: "High-control operations rollout",
    start: "Buying, dispatch, receipts, and settlement tracking.",
    expand: "Compliance, maintenance, analytics, and finance controls.",
  },
];

export const trustClaims = [
  "Role-based views keep different teams focused on the work they need to do",
  "Live workflows already cover retail, schools, gold operations, auto sales, scrap, reporting, maintenance, and compliance",
  "The workflows you see in the demo are already built into the product, not mocked up for a sales call",
  "Portals, branded documents, and admin tooling are already part of the live product",
  "Support, audit visibility, and operational controls are built in for growing teams",
  "You can start with one problem area and expand without replacing the whole setup later",
];

export const audienceSignals = [
  "You manage more than one site, branch, campus, or team",
  "Important work still moves through chat, calls, and spreadsheets",
  "Cash, stock, approvals, or settlements need tighter control",
  "Reporting takes too much manual follow-up",
  "You want to roll out in stages instead of changing everything at once",
];

export const demoHighlights = [
  "Show the workflow that is slowing the business down.",
  "Walk through the sites, teams, and approvals involved.",
  "Review what each role needs to see and do.",
  "Leave with a practical rollout path.",
];

export const demoPreparationItems = [
  "Sites, branches, campuses, yards.",
  "The handoffs that slow you down.",
  "The tool or sheet to replace.",
  "Any reporting edge case.",
];

export const demoOutcomeItems = [
  "We reply with a recommended setup and next step.",
  "You leave with a practical rollout sequence.",
  "You can choose a time on the page.",
];

export const demoConfidencePoints = [
  "Built from the live product",
  "Tailored to your sites and roles",
  "Clear next step before you leave",
];
