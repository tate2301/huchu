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

export const marketingSiteHighlights = ["Shared control plane", "Vertical packs", "Role-specific portals"];

export const proofStats = [
  { label: "Vertical packs ready", value: "6" },
  { label: "Live platform modules", value: "10+" },
  { label: "Role-specific portals", value: "5" },
  { label: "Entry pricing from", value: "$450/mo" },
];

export const valuePillars: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: ShieldCheck,
    title: "Operational control",
    description:
      "Field, campus, yard, shop, and branch workflows stay in one tenant-safe system instead of drifting into spreadsheets and point tools.",
  },
  {
    icon: Coins,
    title: "Finance integrity",
    description:
      "Accounting, tax, fiscalisation, disbursements, and posting-aware flows keep the control layer aligned with daily operations.",
  },
  {
    icon: Dashboard,
    title: "Commercial flexibility",
    description:
      "Tiers, bundles, templates, and feature entitlements let the product fit different sectors without runtime forks or one-off rebuilds.",
  },
  {
    icon: Users,
    title: "Role-specific experiences",
    description:
      "Portals and workspace-aware navigation keep parents, students, teachers, cashiers, managers, and operators focused on the job at hand.",
  },
];

export const showcaseCards = [
  {
    eyebrow: "Gold operations",
    title: "Chain-of-custody, settlement, and reporting from one flow.",
    copy:
      "Track intake, purchases, dispatches, receipts, payouts, audit surfaces, and related reporting without switching systems.",
    chips: ["Dispatches", "Receipts", "Payouts", "Exceptions"],
  },
  {
    eyebrow: "School operations",
    title: "Admissions, academics, finance, boarding, and portals in one workspace.",
    copy:
      "Run the student lifecycle end to end while keeping fees, attendance, notices, and publishing workflows aligned.",
    chips: ["Admissions", "Attendance", "Results", "Parent portal"],
  },
  {
    eyebrow: "Platform admin",
    title: "A product that is operable as a SaaS platform, not just a tenant app.",
    copy:
      "Manage companies, subscriptions, add-ons, support access, reliability, and company-scoped controls through the admin plane.",
    chips: ["Subscriptions", "Support access", "Reliability", "Features"],
  },
];

export const productSteps = [
  "Start with the pack that matches the operating model and the immediate risk.",
  "Run operations, finance, reporting, and governance on shared rails.",
  "Expand with add-ons and portals without forcing a replatform.",
];

export const productFeatureCards = [
  {
    eyebrow: "Foundation rails",
    title: "Identity, tenancy, branding, documents, and notifications stay consistent across the stack.",
    copy:
      "The core platform gives every pack the same account structure, permission model, and output surface so the experience does not fragment as the rollout expands.",
  },
  {
    eyebrow: "Vertical packs",
    title: "Gold, schools, retail, scrap, autos, and other workflows ship as focused operating surfaces.",
    copy:
      "Each pack is opinionated enough to work in the real world, while still inheriting the same data model and control conventions.",
  },
  {
    eyebrow: "Control surfaces",
    title: "Admin, support, and reliability tooling sit beside the product instead of living outside it.",
    copy:
      "Platform operators can review companies, subscriptions, feature access, and incident context without stitching together separate tooling.",
  },
  {
    eyebrow: "Commercial layer",
    title: "Bundles, pricing, and add-ons mirror the actual rollout path, not a feature maze.",
    copy:
      "The marketing story stays aligned with the commercial model, which makes procurement and rollout conversations much cleaner.",
  },
];

export const solutionStories = [
  {
    eyebrow: "Gold operations",
    title: "Track the handoff from intake to settlement without changing systems.",
    copy:
      "Gold teams need more than a generic workflow. This path keeps purchases, dispatches, receipts, exceptions, payouts, and audit trails in one control plane so finance and operations see the same reality.",
    signal: "When cash handling, production, and settlement cannot drift apart.",
    points: ["Chain-of-custody handoff", "Payout and exception control", "Audit surface aligned to finance"],
    outcomes: ["One operating trail from site intake to receipt", "Exception review tied back to payout and finance"],
  },
  {
    eyebrow: "Schools",
    title: "Run admissions, academics, finance, and portals from the same record set.",
    copy:
      "Schools work best when attendance, fees, notices, results, and boarder workflows are all anchored to the same student record instead of spread across disconnected tools and spreadsheets.",
    signal: "When parent, student, and staff views all need to stay in sync.",
    points: ["Admissions through results", "Parent, student, teacher portals", "Fee and boarding controls"],
    outcomes: ["Cleaner handoffs between academic and finance teams", "Role-specific views without duplicate entry"],
  },
  {
    eyebrow: "Retail and POS",
    title: "Keep pricing, purchasing, receiving, and cash-up inside one daily rhythm.",
    copy:
      "Retail and branch teams need predictable control over catalog changes, held carts, refunds, stock movements, and shift close. The solution keeps those flows together so cashier work and back-office discipline stay aligned.",
    signal: "When the same team owns tills, inventory, and closeout.",
    points: ["Shift close discipline", "Stock and pricing control", "Held carts and refunds"],
    outcomes: ["Operational clarity at the till and in the back office", "A tighter link between sales, stock, and cash-up"],
  },
  {
    eyebrow: "Platform admin",
    title: "Operate the SaaS business with company records, entitlements, and support tooling.",
    copy:
      "The admin plane lets platform teams manage companies, subscriptions, add-ons, support access, reliability, and health checks as first-class workflows rather than hidden internal scripts.",
    signal: "When the platform itself needs operational governance.",
    points: ["Subscription and entitlement control", "Company-scoped support access", "Health and audit surfaces"],
    outcomes: ["A clearer control plane for operations teams", "Commercial and support context in one place"],
  },
];

export const verticalCards: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: Gem,
    title: "Gold Operations",
    description: "Chain-of-custody visibility, settlement control, payroll coordination, and reporting for mines and buyers.",
  },
  {
    icon: Recycle,
    title: "Scrap & Recycling",
    description: "Buying discipline, yard stock visibility, pricing control, and bulk sales and settlement workflows.",
  },
  {
    icon: Building2,
    title: "Schools",
    description: "Student lifecycle, academics, attendance, boarding, fees, and role-based portals in one system.",
  },
  {
    icon: Users,
    title: "Auto Sales",
    description: "Lead-to-deal visibility, inventory coordination, financing support, and disciplined deal progression.",
  },
  {
    icon: ReceiptLong,
    title: "Retail & POS",
    description: "Catalog, pricing, receiving, purchasing, cashier control, held carts, refund flows, and shift close.",
  },
  {
    icon: Camera,
    title: "Multi-site operations",
    description: "People, stock, CCTV, maintenance, and finance controls combined in one shared operating layer.",
  },
];

export const pricingTiers = [
  {
    tier: "Basic",
    price: "$450",
    sites: "1 site included",
    extraSite: "$90 / extra site",
    stage: "Launch one operating model",
    bestFor: "Single-site teams validating one operational pack.",
    summary: "Entry point for smaller teams or tightly scoped vertical rollouts.",
    detail: "Best when you want one live workflow, explicit ownership, and a low-friction starting point.",
  },
  {
    tier: "Standard",
    price: "$900",
    sites: "3 sites included",
    extraSite: "$140 / extra site",
    stage: "Scale across sites",
    bestFor: "Operators coordinating branches, campuses, or yards.",
    summary: "Balanced fit for expanding teams that need multi-site visibility.",
    detail: "Designed for rollouts across a cluster that want a shared financial spine before complexity multiplies.",
  },
  {
    tier: "Enterprise",
    price: "$1,800",
    sites: "8 sites included",
    extraSite: "$220 / extra site",
    stage: "Run the broader group",
    bestFor: "Larger organizations that need governance and rollout planning.",
    summary: "Broad operating suite for more complex organizations.",
    detail: "Fits groups that need deeper controls, broader workflow coverage, and a cleaner path to phased expansion.",
  },
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
    note: "Foundational finance controls for posting-aware operations and a tighter month-end.",
  },
  {
    name: "Accounting Advanced",
    price: "$350/mo",
    note: "AR, AP, banking, budgets, assets, and FX for heavier finance teams.",
  },
  {
    name: "Gold Advanced",
    price: "$220/mo",
    note: "Reconciliation, exception handling, audit, and payout support for gold workflows.",
  },
  {
    name: "Schools Suite",
    price: "$320/mo",
    note: "Student, academic, boarding, fee, and portal workflows in one expansion pack.",
  },
  {
    name: "Compliance Pro",
    price: "$200/mo",
    note: "Permits, inspections, incidents, and training across regulated sites.",
  },
  {
    name: "Maintenance Pro",
    price: "$180/mo",
    note: "Equipment, work orders, and breakdown coordination for asset-heavy operations.",
  },
];

export const rolloutPaths = [
  {
    title: "Gold rollout",
    start: "Operations core, purchasing, and settlement control",
    expand: "Gold Advanced, Compliance Pro, Maintenance Pro, and Accounting",
  },
  {
    title: "Schools rollout",
    start: "Admissions, attendance, fees, and portals",
    expand: "Boarding, results, reporting, and accounting as the institution matures",
  },
  {
    title: "Multi-site rollout",
    start: "Catalog, POS, stock, and shift close",
    expand: "Maintenance, CCTV, analytics, and branding once the baseline is stable",
  },
];

export const trustClaims = [
  "Multi-tenant platform with tenant-aware host enforcement",
  "Vertical workspaces and client templates are already wired into the product",
  "Live modules for gold, schools, retail/POS, autos, scrap, accounting, HR, maintenance, compliance, CCTV, and reporting",
  "Role-specific portals for parents, students, teachers, cashiers, and platform admins",
  "Branding, document templating, and PDF rendering are part of the stack",
  "Support, reliability, and audit tooling live in the admin plane instead of as afterthoughts",
];

export const audienceSignals = [
  "Multiple sites, branches, or campuses",
  "Operational handoffs between departments",
  "Cash, stock, or settlement control requirements",
  "Audit and compliance pressure",
  "A need to stage adoption pack by pack",
];

export const demoHighlights = [
  "Show the pack that maps to your operating model.",
  "Walk through approvals, handoffs, and exceptions.",
  "Review sites, roles, and rollout sequence.",
  "Compare pricing and add-ons for phase one.",
];
