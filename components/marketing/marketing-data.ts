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

export const marketingSiteHighlights = ["Shared rails", "Vertical packs", "Role portals"];

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
  "Start with the pack that matches the operating model.",
  "Keep operations, finance, and reporting on the same rails.",
  "Expand with add-ons and portals without forcing a replatform.",
];

export const productFeatureCards = [
  {
    eyebrow: "Foundation rails",
    title: "Identity, tenancy, branding, documents, and notifications stay fixed.",
    copy: "Every pack inherits the same account structure and permission model.",
  },
  {
    eyebrow: "Vertical packs",
    title: "Gold, schools, retail, scrap, autos, and other workflows ship as focused surfaces.",
    copy: "Each pack brings its own vocabulary, but the core data model stays shared.",
  },
  {
    eyebrow: "Control surfaces",
    title: "Admin, support, and reliability tooling stay inside the product loop.",
    copy: "Operators can review companies, subscriptions, features, and incidents in one place.",
  },
  {
    eyebrow: "Commercial layer",
    title: "Bundles, pricing, and add-ons mirror the rollout path.",
    copy: "The commercial story follows how customers actually adopt the platform.",
  },
];

export const productControlMap = [
  {
    title: "What stays constant",
    copy: "Tenant boundary, permissions, branding, documents.",
  },
  {
    title: "What changes by sector",
    copy: "The work changes. Gold, schools, and retail need different operating language.",
  },
  {
    title: "What buyers feel",
    copy: "One platform. Clear expansion. Less sprawl.",
  },
];

export const solutionStories = [
  {
    eyebrow: "Gold operations",
    title: "Track the handoff from intake to settlement without changing systems.",
    copy: "Purchases, dispatches, receipts, exceptions, payouts, and audit trails stay in one control plane.",
    signal: "When cash, production, and settlement cannot drift.",
    points: ["Chain of custody", "Payout control", "Audit alignment"],
    outcomes: ["One trail from intake to receipt", "Exceptions tied back to finance"],
    start: "Purchases, dispatches, receipts.",
    expand: "Gold advanced, accounting, compliance, maintenance.",
  },
  {
    eyebrow: "Schools",
    title: "Run admissions, academics, finance, and portals from the same record set.",
    copy: "Attendance, fees, notices, results, and boarding stay anchored to one student record.",
    signal: "When parent, student, and staff views must stay in sync.",
    points: ["Admissions to results", "Parent, student, teacher portals", "Fee and boarding controls"],
    outcomes: ["Cleaner academic and finance handoffs", "No duplicate entry"],
    start: "Admissions, attendance, fees.",
    expand: "Boarding, results, finance, reporting.",
  },
  {
    eyebrow: "Retail and POS",
    title: "Keep pricing, purchasing, receiving, and cash-up inside one daily rhythm.",
    copy: "Catalog changes, held carts, refunds, stock movements, and shift close stay together.",
    signal: "When the same team owns tills, inventory, and closeout.",
    points: ["Shift close", "Stock control", "Held carts and refunds"],
    outcomes: ["Clarity at the till", "Tighter sales and cash-up control"],
    start: "Catalog, POS, purchasing.",
    expand: "Accounting, CCTV, maintenance, promotions.",
  },
  {
    eyebrow: "Platform admin",
    title: "Operate the SaaS business with company records, entitlements, and support tooling.",
    copy: "Companies, subscriptions, add-ons, support access, reliability, and health checks stay first-class.",
    signal: "When the platform itself needs governance.",
    points: ["Subscriptions and entitlements", "Company-scoped support", "Health and audit surfaces"],
    outcomes: ["One control plane for operators", "Commercial and support context together"],
    start: "Companies, subscriptions, support.",
    expand: "Features, insights, reliability, controls.",
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
    bestFor: "Single-site teams.",
    summary: "For focused rollouts.",
    detail: "One live workflow. Clear ownership.",
  },
  {
    tier: "Standard",
    price: "$900",
    sites: "3 sites included",
    extraSite: "$140 / extra site",
    stage: "Scale across sites",
    bestFor: "Growing multi-site teams.",
    summary: "For branch clusters.",
    detail: "Shared financial spine before complexity grows.",
  },
  {
    tier: "Enterprise",
    price: "$1,800",
    sites: "8 sites included",
    extraSite: "$220 / extra site",
    stage: "Run the broader group",
    bestFor: "Larger groups.",
    summary: "For broader governance.",
    detail: "Deeper controls and phased expansion.",
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
    title: "Gold rollout",
    start: "Purchasing, stores, chain of custody.",
    expand: "Gold Advanced, compliance, maintenance, accounting.",
  },
  {
    title: "Schools rollout",
    start: "Admissions, attendance, fees, portals.",
    expand: "Boarding, results, reporting, accounting.",
  },
  {
    title: "Multi-site rollout",
    start: "Catalog, POS, stock, shift close.",
    expand: "Maintenance, CCTV, analytics, branding.",
  },
];

export const trustClaims = [
  "Tenant-aware host routing and workspace scoping are in production",
  "Client templates, feature gates, and bundle logic drive rollout setup",
  "Live modules cover gold, schools, retail/POS, autos, scrap, accounting, HR, maintenance, compliance, CCTV, and reporting",
  "Role-specific portals cover parents, students, teachers, cashiers, and admins",
  "Branding, templates, versioned PDF rendering, and artifacts are live",
  "Support access, reliability, health, and audit tooling live in the admin plane",
];

export const audienceSignals = [
  "Multiple sites, one finance owner",
  "Operational handoffs between teams",
  "Cash, stock, or settlement control",
  "Audit, compliance, or reporting pressure",
  "Pack-by-pack rollout",
];

export const demoHighlights = [
  "Show the pack that fits.",
  "Walk the handoffs that matter.",
  "Review sites, roles, rollout.",
  "Compare the tier and add-ons.",
];

export const demoPreparationItems = [
  "Sites, branches, campuses, yards.",
  "The handoffs that slow you down.",
  "The tool or sheet to replace.",
  "Any reporting edge case.",
];

export const demoOutcomeItems = [
  "We reply with a pack and path.",
  "You leave with a rollout sequence.",
  "You can lock time on the page.",
];

export const demoConfidencePoints = [
  "Built from the live product",
  "Tailored to your sites and roles",
  "Clear next step before you leave",
];
