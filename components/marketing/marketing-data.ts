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
      "Field, campus, yard, shop, and branch workflows run in one tenant-safe system instead of disconnected spreadsheets and point tools.",
  },
  {
    icon: Coins,
    title: "Finance integrity",
    description:
      "Accounting, tax, fiscalisation, disbursements, and posting-aware flows strengthen controls behind day-to-day operations.",
  },
  {
    icon: Dashboard,
    title: "Commercial flexibility",
    description:
      "Tiers, bundles, templates, and feature entitlements let the product fit different sectors without runtime forks.",
  },
  {
    icon: Users,
    title: "Role-specific experiences",
    description:
      "Portals and workspace-aware navigation keep parents, students, teachers, cashiers, managers, and operators focused on the job to be done.",
  },
];

export const showcaseCards = [
  {
    eyebrow: "Gold operations",
    title: "Chain-of-custody, settlement, and reporting from one flow.",
    copy:
      "Track output, purchases, dispatches, receipts, payouts, audit surfaces, and related reporting without switching systems.",
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
  "Start with the vertical pack that fits the operating model.",
  "Run operations, finance, reporting, and administration on shared rails.",
  "Expand with add-ons and portals without replacing the stack.",
];

export const solutionStories = [
  {
    eyebrow: "Gold operations",
    title: "Chain-of-custody, settlement, and reporting from one flow.",
    copy:
      "Track output, purchases, dispatches, receipts, payouts, audit surfaces, and related reporting without switching systems.",
    points: ["Dispatches and receipts", "Payout-linked visibility", "Exceptions and audit trace"],
  },
  {
    eyebrow: "Schools",
    title: "Admissions, academics, finance, and portals aligned.",
    copy:
      "Run the student lifecycle with attendance, fees, boarding, notices, and role-specific portals without splitting work across disconnected tools.",
    points: ["Admissions to results publishing", "Finance and fee workflows", "Parent, student, teacher portals"],
  },
  {
    eyebrow: "Retail and POS",
    title: "Cashier control, stock discipline, and shift close in one model.",
    copy:
      "Keep pricing, purchasing, receiving, returns, cash-up, and held carts inside the same daily operating rhythm.",
    points: ["POS and cashier control", "Stock and pricing discipline", "Shift and cash-up visibility"],
  },
  {
    eyebrow: "Platform admin",
    title: "A product that is operable as a SaaS platform, not just a tenant app.",
    copy:
      "Manage companies, subscriptions, add-ons, support access, reliability, and company-scoped controls from a dedicated control layer.",
    points: ["Subscriptions and bundles", "Support access controls", "Reliability and health views"],
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
    summary: "Entry point for smaller tenants or tightly scoped vertical packs.",
    detail: "Best for focused rollouts that need one live workflow, clear operator control, and a low-friction starting point.",
  },
  {
    tier: "Standard",
    price: "$900",
    sites: "3 sites included",
    extraSite: "$140 / extra site",
    stage: "Scale across sites",
    summary: "Best fit for growing operators that need multi-site visibility and pack expansion.",
    detail: "Designed for teams moving beyond a single branch, campus, or yard and wanting shared visibility before complexity multiplies.",
  },
  {
    tier: "Enterprise",
    price: "$1,800",
    sites: "8 sites included",
    extraSite: "$220 / extra site",
    stage: "Run the broader group",
    summary: "Full operating suite for larger groups with broader controls and deeper rollout scope.",
    detail: "Fits larger operators that need tighter governance, broader workflow coverage, and a cleaner path to phased expansion.",
  },
];

export const addOns = [
  "Accounting Core",
  "Accounting Advanced",
  "Gold Advanced",
  "Schools Suite",
  "Retail Suite",
  "Autos Suite",
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
    note: "Core accounting and financial control for operators who want tighter posting-aware workflows.",
  },
  {
    name: "Accounting Advanced",
    price: "$350/mo",
    note: "AR, AP, banking, budgets, assets, and FX coverage for teams with deeper finance requirements.",
  },
  {
    name: "Gold Advanced",
    price: "$220/mo",
    note: "Reconciliation, exceptions, audit, and payout support for gold operators expanding beyond baseline flows.",
  },
  {
    name: "Schools Suite",
    price: "$320/mo",
    note: "Student, academics, boarding, fee administration, and school portal workflows in one expansion pack.",
  },
  {
    name: "Compliance Pro",
    price: "$200/mo",
    note: "Permits, inspections, incidents, and training workflows for operators under stronger governance pressure.",
  },
  {
    name: "Maintenance Pro",
    price: "$180/mo",
    note: "Equipment, work orders, and breakdown coordination for asset-heavy environments.",
  },
];

export const rolloutPaths = [
  {
    title: "Gold rollout",
    start: "Operations core, workforce, stores, and gold foundation",
    expand: "Gold Advanced, Compliance Pro, Maintenance Pro, Analytics, and Accounting",
  },
  {
    title: "Schools rollout",
    start: "Schools Suite with Portal Suite",
    expand: "Accounting, branding, reporting, and finance-heavy controls as the institution matures",
  },
  {
    title: "Multi-site rollout",
    start: "Stores, workforce, and CCTV-led control",
    expand: "Accounting, maintenance, analytics, and branding once the operating baseline is stable",
  },
];

export const trustClaims = [
  "Multi-tenant platform with tenant-aware host enforcement",
  "Configurable vertical workspaces and client templates",
  "Live modules for gold, recycling, schools, auto sales, retail/POS, accounting, HR, maintenance, compliance, CCTV, and reporting",
  "Role-specific portals for parents, students, teachers, cashiers/POS users, and platform admins",
  "Branding, document templating, and PDF/document rendering infrastructure",
  "Platform admin portal plus deeper operator tooling for support, reliability, and audit workflows",
];

export const audienceSignals = [
  "Multiple sites, branches, or campuses",
  "Operational handoffs between departments",
  "Cash, stock, or settlement control requirements",
  "Audit and compliance pressure",
  "A need to stage adoption pack by pack",
];

export const demoHighlights = [
  "Show the pack that matches your business.",
  "Walk through the workflow you want to replace.",
  "Talk through rollout scope, sites, and add-ons.",
];
