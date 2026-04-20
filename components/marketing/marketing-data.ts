import {
  Badge,
  Building2,
  Camera,
  Checkroom,
  Coins,
  Dashboard,
  DirectionsCar,
  Gem,
  Manufacturing,
  Policy,
  ReceiptLong,
  Recycle,
  Scale,
  ShieldCheck,
  Warehouse,
  type LucideIcon,
} from "@/lib/icons";
import {
  FEATURE_BUNDLES,
  type FeatureBundleDefinition,
} from "@/lib/platform/feature-catalog";

export const marketingNavItems = [
  { label: "Product", href: "/home/product" },
  { label: "Solutions", href: "/home/solutions" },
  { label: "Pricing", href: "/home/pricing" },
  { label: "Demo", href: "/home/book-demo" },
];

export const marketingSiteHighlights = [
  "Works offline — built for Zimbabwe",
  "Start at $39/month",
  "Set up in 5 minutes",
];

export const proofStats = [
  { label: "Zimbabwe businesses running on Corelith", value: "3+" },
  { label: "Industry verticals supported", value: "12+" },
  { label: "Works offline when internet drops", value: "100%" },
  { label: "Starting price per month", value: "$39" },
];

export const valuePillars: Array<{
  icon: LucideIcon;
  title: string;
  description: string;
}> = [
  {
    icon: ShieldCheck,
    title: "Tighter operational control",
    description:
      "See what is happening across sites, teams, and workflows without chasing updates in separate tools.",
  },
  {
    icon: Coins,
    title: "Cash and stock discipline",
    description:
      "Keep the work that affects stock, purchasing, payouts, and reporting connected in one system.",
  },
  {
    icon: Dashboard,
    title: "Reporting you can trust",
    description:
      "Managers get a clearer picture because sites, approvals, and records follow the same flow.",
  },
  {
    icon: Scale,
    title: "A setup that grows with you",
    description:
      "Start with the part of the business causing the most friction, then add more as the team expands.",
  },
];

export const showcaseCards = [
  {
    eyebrow: "Retail and branch teams",
    title: "Keep stock, cash-up, and purchasing from drifting apart.",
    copy: "Stores, branch teams, and supervisors follow the same process instead of patching together tills, spreadsheets, and chat updates.",
    chips: ["Stock", "Cash-up", "Purchasing", "Approvals"],
  },
  {
    eyebrow: "Schools and institutions",
    title: "Run admin, finance, and academics from the same record.",
    copy: "Admissions, fees, attendance, boarding, and results stay anchored to one student record instead of separate admin tools.",
    chips: ["Admissions", "Fees", "Boarding", "Portals"],
  },
  {
    eyebrow: "High-control operations",
    title: "Track sensitive workflows with a clear chain of responsibility.",
    copy: "For buying, dispatch, receipts, settlements, and other high-control work, teams get a single trail instead of disconnected handoffs.",
    chips: ["Dispatch", "Receipts", "Settlements", "Audit trail"],
  },
];

export const productSteps = [
  "Start with the workflow causing the most delays, mistakes, or risk.",
  "Bring sites, teams, approvals, and reporting into one shared process.",
  "Add more locations, controls, and workflows as the business grows.",
];

export const productFeatureCards = [
  {
    eyebrow: "One place to work",
    title: "Daily activity stops living in spreadsheets and chat threads.",
    copy: "Teams follow work from start to finish without re-entering the same details in multiple places.",
  },
  {
    eyebrow: "Views for each role",
    title: "Managers, cashiers, supervisors, and admins see what matters.",
    copy: "Each team gets a focused workspace instead of one crowded screen for everyone.",
  },
  {
    eyebrow: "Connected records",
    title: "Approvals, stock, money, and reporting stay tied to the same flow.",
    copy: "That means fewer gaps between what happened on the ground and what leadership sees later.",
  },
  {
    eyebrow: "Room to grow",
    title: "Roll out in stages instead of replacing everything at once.",
    copy: "Start where the pressure is highest, then expand to more teams, sites, and controls when ready.",
  },
];

export const productControlMap = [
  {
    title: "Before",
    copy: "Teams rely on spreadsheets, WhatsApp updates, and disconnected tools that never quite match.",
  },
  {
    title: "After",
    copy: "Work, approvals, stock movements, and reports live in one shared system with clear ownership.",
  },
  {
    title: "Why it matters",
    copy: "You spend less time chasing updates, fixing avoidable mistakes, and rebuilding reports by hand.",
  },
];

export const productOverviewPills = [
  "Modular workflows",
  "Role-based operations",
  "Stage-by-stage rollout",
];

export const productOperatingSteps = [
  "Start with the workflow that is slowing the business down or creating the most risk.",
  "Turn on the roles, records, and controls that support that workflow.",
  "Add more solutions as the next part of the business is ready.",
];

export const productCapabilityCards = [
  {
    eyebrow: "Operations",
    title: "Keep daily work, handoffs, and approvals in one flow.",
    copy: "Teams stop relying on scattered updates when tasks, records, and next steps live in one system.",
  },
  {
    eyebrow: "Reporting",
    title: "See performance from live work, not spreadsheets rebuilt later.",
    copy: "Owners and managers get clearer visibility because reporting stays connected to what happened on the ground.",
  },
  {
    eyebrow: "Documents",
    title: "Keep branded records and forms close to the workflow.",
    copy: "Important paperwork no longer lives in a different tool from the activity that created it.",
  },
  {
    eyebrow: "Roles",
    title: "Give each team the view, access, and responsibilities that fit.",
    copy: "Cashiers, supervisors, managers, clerks, and admins each see what matters to them.",
  },
  {
    eyebrow: "Oversight",
    title: "Run support and controls without losing business context.",
    copy: "You get a stronger handle on what is happening across sites, teams, and exceptions.",
  },
  {
    eyebrow: "Growth",
    title: "Add more depth without throwing away the product underneath.",
    copy: "As the business grows, you expand the solution instead of replacing the software.",
  },
];

export const productModularityCards = [
  {
    eyebrow: "Shared base",
    title: "One product sits underneath every solution.",
    copy: "Permissions, documents, reporting, notifications, and admin controls stay shared instead of being rebuilt for each case.",
  },
  {
    eyebrow: "Adaptable workflows",
    title: "The workflow layer shifts to match how the business runs.",
    copy: "Retail, schools, gold, scrap, auto sales, and multi-site ops can each use workflows tailored to that environment.",
  },
  {
    eyebrow: "Why owners care",
    title: "Growth feels like adding capability, not starting again.",
    copy: "You avoid buying a separate system for every team and avoid retraining the business every time you expand.",
  },
];

export const productOutcomeRows = [
  {
    title: "Keep the backbone, change the workflow",
    copy: "When the operating model changes, you do not throw away shared controls, reporting, and admin.",
  },
  {
    title: "Roll out in the order the business needs",
    copy: "Start where pressure is highest, prove the change, then turn on the next layer when the team is ready.",
  },
  {
    title: "Give leaders one clearer picture",
    copy: "A shared product base makes it easier to compare sites, spot issues sooner, and keep decisions grounded in live activity.",
  },
];

export const solutionsSellingPoints = [
  {
    title: "Each solution starts with a business case",
    copy: "The conversation begins with the operational problem you need to solve, not a list of software features.",
  },
  {
    title: "Every solution sits on the same product base",
    copy: "That means clearer rollout, less retraining, and fewer disconnected tools as the business grows.",
  },
  {
    title: "The demo stays specific to your business",
    copy: "You see the workflow that fits your environment instead of a generic tour that leaves you doing the translation.",
  },
];

export type SolutionPage = {
  slug: string;
  title: string;
  navLabel: string;
  eyebrow: string;
  headline: string;
  summary: string;
  icon: LucideIcon;
  audience: string;
  fitSignals: string[];
  pains: string[];
  capabilities: Array<{
    title: string;
    copy: string;
  }>;
  outcomes: string[];
  startWith: string;
  expandWith: string;
  modules: string[];
  recommendedTier: "Starter" | "Growth" | "Business";
  defaultAddOns: string[];
  category: "all" | "high-control" | "retail" | "schools" | "services" | "multi-site";
};

export const solutionPages: SolutionPage[] = [
  {
    slug: "gold-operations",
    title: "Gold operations",
    navLabel: "Gold",
    eyebrow: "Gold operations",
    headline: "Control buying, dispatch, receipts, settlement, and reporting in one place.",
    summary:
      "Built for mines, buying offices, and processing operations that need tighter visibility from intake to payout.",
    icon: Gem,
    audience: "Best for mines, buying offices, and processing operations with strict control requirements.",
    fitSignals: ["Material movement", "Settlement control", "Audit pressure"],
    pains: [
      "Material, cash exposure, and approvals move through different hands during the day.",
      "Dispatch and receipt records drift when teams rely on separate tools or delayed follow-up.",
      "Settlement questions take too long to answer after the fact when the trail is fragmented.",
    ],
    capabilities: [
      {
        title: "Track intake and buying activity",
        copy: "Keep purchases, output, and early-stage records in the same workflow instead of scattered sheets.",
      },
      {
        title: "Follow dispatch and receipt clearly",
        copy: "See how material moves between locations and who handled each step along the way.",
      },
      {
        title: "Support settlement reviews",
        copy: "Keep payout and settlement work close to the operational record instead of rebuilding context later.",
      },
      {
        title: "Keep reporting close to the workflow",
        copy: "Owners and managers can review live activity with less chasing and cleaner audit visibility.",
      },
    ],
    outcomes: [
      "Less money lost to unclear handoffs",
      "Faster answers when something needs review",
      "A cleaner trail from material movement to settlement",
    ],
    startWith: "Buying, dispatch, receipt visibility, and settlement tracking.",
    expandWith: "Compliance, maintenance, deeper finance controls, and analytics.",
    modules: ["Buying", "Dispatch", "Receipts", "Settlement", "Reporting"],
    recommendedTier: "Business",
    defaultAddOns: ["ADDON_GOLD_CORE", "ADDON_GOLD_ADVANCED"],
    category: "high-control",
  },
  {
    slug: "schools",
    title: "Schools",
    navLabel: "Schools",
    eyebrow: "Schools",
    headline: "Run admissions, attendance, fees, notices, and school operations from one record set.",
    summary:
      "Built for schools and training institutions that need cleaner admin handoffs, better visibility, and less duplicated work.",
    icon: Building2,
    audience: "Best for private schools, campuses, and training institutions managing both academics and operations.",
    fitSignals: ["Student records", "Fees and notices", "Parent visibility"],
    pains: [
      "Student, attendance, and finance information often lives in separate tools that do not stay aligned.",
      "Parents, staff, and administrators lose time when notices and updates move through too many channels.",
      "School leadership struggles to get one clean picture of attendance, fees, and daily operations.",
    ],
    capabilities: [
      {
        title: "Keep the student record at the center",
        copy: "Admissions, attendance, notices, and related activity stay anchored to one source of truth.",
      },
      {
        title: "Handle fee and school administration together",
        copy: "Finance and operations can move in the same direction instead of creating duplicate admin work.",
      },
      {
        title: "Support parent, student, and staff visibility",
        copy: "Role-based portals help each group see the information that matters to them.",
      },
      {
        title: "Give leadership cleaner reporting",
        copy: "School owners and administrators can review what is happening without stitching reports together by hand.",
      },
    ],
    outcomes: [
      "Less duplicate entry across departments",
      "Clearer parent and staff communication",
      "A stronger grip on school operations and finance",
    ],
    startWith: "Admissions, attendance, fees, notices, and core school records.",
    expandWith: "Boarding, portals, results, reporting, and deeper finance workflows.",
    modules: ["Admissions", "Attendance", "Fees", "Portals", "Reporting"],
    recommendedTier: "Starter",
    defaultAddOns: ["ADDON_SCHOOLS_SUITE"],
    category: "schools",
  },
  {
    slug: "retail-pos",
    title: "Retail and POS",
    navLabel: "Retail",
    eyebrow: "Retail and POS",
    headline: "Keep stock, sales, cashier control, and shift close moving in the same rhythm.",
    summary:
      "Built for retail teams that need tighter branch visibility, cleaner cashier control, and less confusion between stock and sales.",
    icon: ReceiptLong,
    audience: "Best for shops, branch retailers, resale operators, and growing POS-heavy teams.",
    fitSignals: ["Cash-up control", "Stock visibility", "Branch reporting"],
    pains: [
      "Stock movement and till activity drift apart when teams are using different tools or ad hoc processes.",
      "Refunds, voids, and cashier exceptions create pressure when oversight is weak or delayed.",
      "Owners struggle to see what is happening across branches until the day is already over.",
    ],
    capabilities: [
      {
        title: "Keep sales and stock in the same flow",
        copy: "Catalog, POS activity, and stock control stay tied together instead of needing manual reconciliation later.",
      },
      {
        title: "Support cashier control and exceptions",
        copy: "Refunds, voids, held carts, and shift-close work stay easier to review and manage.",
      },
      {
        title: "Keep purchasing and receiving connected",
        copy: "Store teams can follow stock from receipt to sale with fewer blind spots.",
      },
      {
        title: "Give owners faster branch visibility",
        copy: "Managers can compare locations with less waiting and fewer spreadsheet handoffs.",
      },
    ],
    outcomes: [
      "Tighter control of stock and cash handling",
      "Faster branch-level oversight",
      "Less friction between store operations and reporting",
    ],
    startWith: "POS, stock control, receiving, cashier visibility, and shift close.",
    expandWith: "Purchasing, finance, maintenance, promotions, and broader reporting.",
    modules: ["POS", "Stock", "Receiving", "Cashier control", "Shift close"],
    recommendedTier: "Growth",
    defaultAddOns: ["ADDON_RETAIL_SUITE"],
    category: "retail",
  },
  {
    slug: "auto-sales",
    title: "Auto sales",
    navLabel: "Auto sales",
    eyebrow: "Auto sales",
    headline: "Track leads, inventory, deal progress, and financing handoffs without losing the thread.",
    summary:
      "Built for dealerships and vehicle traders that need a cleaner path from first enquiry to closed deal.",
    icon: DirectionsCar,
    audience: "Best for dealerships and vehicle traders that need visibility from lead to delivery.",
    fitSignals: ["Lead tracking", "Inventory control", "Deal progression"],
    pains: [
      "Lead information, stock details, and deal progress often live in different places.",
      "Deals slow down when approvals, reservations, and financing handoffs depend on follow-up by memory.",
      "Owners struggle to see which opportunities are moving, stalled, or at risk.",
    ],
    capabilities: [
      {
        title: "Keep leads and stock in one operating view",
        copy: "Sales teams can match customer activity to live inventory without hunting through separate systems.",
      },
      {
        title: "Track deal progression clearly",
        copy: "Reservations, contracts, and next steps stay visible so opportunities are less likely to drift.",
      },
      {
        title: "Support financing and approval handoffs",
        copy: "Important decisions stay attached to the deal instead of disappearing into side conversations.",
      },
      {
        title: "Give owners a stronger sales picture",
        copy: "Leadership can review pipeline, stock movement, and deal status with less manual follow-up.",
      },
    ],
    outcomes: [
      "Cleaner lead-to-deal visibility",
      "Less deal slippage between teams",
      "Stronger oversight of sales activity and stock",
    ],
    startWith: "Lead tracking, inventory visibility, and deal-stage control.",
    expandWith: "Financing support, reporting, support workflows, and broader oversight.",
    modules: ["Leads", "Inventory", "Deal stages", "Approvals", "Reporting"],
    recommendedTier: "Starter",
    defaultAddOns: ["ADDON_AUTOS_SUITE"],
    category: "services",
  },
  {
    slug: "scrap-recycling",
    title: "Scrap and recycling",
    navLabel: "Scrap",
    eyebrow: "Scrap and recycling",
    headline: "Control buying, yard stock, pricing decisions, and bulk sales from one operating system.",
    summary:
      "Built for scrap yards and recyclers that need tighter control of buying discipline, stock visibility, and trading activity.",
    icon: Recycle,
    audience: "Best for scrap yards, recyclers, and industrial scrap traders managing high-volume movement.",
    fitSignals: ["Buying discipline", "Yard stock", "Bulk sales control"],
    pains: [
      "Buying decisions and yard stock records drift when teams are working from separate views.",
      "Pricing changes are hard to manage when operational context is not close to the transaction.",
      "Bulk sales and settlements become harder to trust when the underlying stock picture is weak.",
    ],
    capabilities: [
      {
        title: "Track buying with stronger discipline",
        copy: "Keep incoming material and purchase activity inside a process the team can actually follow.",
      },
      {
        title: "See yard stock more clearly",
        copy: "Stock visibility improves when buying, movement, and sales are connected in one flow.",
      },
      {
        title: "Support pricing and bulk sales decisions",
        copy: "Commercial decisions stay closer to live stock and operational records.",
      },
      {
        title: "Keep trading activity easier to review",
        copy: "Owners and managers can see what moved, what sold, and where attention is needed.",
      },
    ],
    outcomes: [
      "Better yard stock visibility",
      "Stronger control of buying and sales",
      "Less guesswork around trading activity",
    ],
    startWith: "Buying records, yard stock visibility, and bulk sales control.",
    expandWith: "Finance, compliance, maintenance, and broader reporting.",
    modules: ["Buying", "Yard stock", "Pricing", "Bulk sales", "Reporting"],
    recommendedTier: "Growth",
    defaultAddOns: ["ADDON_SCRAP_METAL_SUITE"],
    category: "high-control",
  },
  {
    slug: "multi-site-operations",
    title: "Multi-site operations",
    navLabel: "Multi-site",
    eyebrow: "Multi-site operations",
    headline: "Run people, stock, oversight, and reporting across locations without building around spreadsheets.",
    summary:
      "Built for growing businesses that need stronger branch-level visibility and cleaner operational control across the group.",
    icon: Camera,
    audience: "Best for growing groups with more than one branch, team, or operating environment.",
    fitSignals: ["Branch oversight", "Shared controls", "Cross-site reporting"],
    pains: [
      "Each site creates its own workarounds when there is no shared operating system underneath the business.",
      "Owners lose time chasing updates from managers before they can understand what is really happening.",
      "Support, maintenance, people, and control issues become harder to coordinate as the group expands.",
    ],
    capabilities: [
      {
        title: "Give each site a clearer operating view",
        copy: "Locations can work from the same product while still seeing the roles and workflows that fit them.",
      },
      {
        title: "Support shared oversight across the group",
        copy: "Management can follow issues, exceptions, and daily activity without waiting for manual rollups.",
      },
      {
        title: "Connect people, stock, and operational controls",
        copy: "Different parts of the business stay easier to manage when they are not split across separate tools.",
      },
      {
        title: "Expand without rebuilding the whole stack",
        copy: "New branches and new workflows can join the same product base as the group grows.",
      },
    ],
    outcomes: [
      "Clearer branch-level visibility",
      "Less reporting lag across the group",
      "A stronger operational grip as the business expands",
    ],
    startWith: "Site visibility, role-based oversight, and shared operational controls.",
    expandWith: "Maintenance, CCTV, compliance, reporting, and deeper admin workflows.",
    modules: ["Sites", "Oversight", "People", "Controls", "Reporting"],
    recommendedTier: "Growth",
    defaultAddOns: ["ADDON_USER_MANAGEMENT_PRO"],
    category: "multi-site",
  },
  {
    slug: "human-resources-payroll",
    title: "HR and Payroll",
    navLabel: "HR",
    eyebrow: "Human resources",
    headline: "Manage employees, compensation, and payroll from one workforce record.",
    summary:
      "Built for businesses that need cleaner employee lifecycle management, structured compensation, and reliable payroll runs.",
    icon: Badge,
    audience: "Best for growing teams that need structured HR, payroll, and workforce compliance.",
    fitSignals: ["Employee records", "Payroll accuracy", "Compensation rules"],
    pains: [
      "Employee records, incidents, and compensation live in disconnected files and spreadsheets.",
      "Payroll errors and delays create tension when calculations depend on manual handoffs.",
      "Leadership lacks visibility into workforce costs, incidents, and compliance status.",
    ],
    capabilities: [
      {
        title: "Centralize employee records",
        copy: "Directory, incidents, disciplinary actions, and compensation profiles stay in one place.",
      },
      {
        title: "Run payroll with stronger controls",
        copy: "Payroll periods, disbursement batches, and approval history follow a structured workflow.",
      },
      {
        title: "Support complex compensation rules",
        copy: "Compensation templates and rules adapt to different roles, shifts, and settlement types.",
      },
      {
        title: "Keep workforce oversight connected",
        copy: "Managers can review employee status, incidents, and payroll history without chasing files.",
      },
    ],
    outcomes: [
      "Fewer payroll errors and delays",
      "Clearer workforce records and compliance",
      "Less time spent on manual HR administration",
    ],
    startWith: "Employee directory, incidents, compensation, and payroll.",
    expandWith: "Advanced payroll, settlements, user management, and reporting.",
    modules: ["Employees", "Incidents", "Compensation", "Payroll", "Disbursements"],
    recommendedTier: "Growth",
    defaultAddOns: ["ADDON_ADVANCED_PAYROLL"],
    category: "services",
  },
  {
    slug: "maintenance",
    title: "Maintenance",
    navLabel: "Maintenance",
    eyebrow: "Maintenance",
    headline: "Track equipment, work orders, breakdowns, and preventive schedules in one register.",
    summary:
      "Built for operations that need to keep assets running, schedule maintenance, and reduce unplanned downtime.",
    icon: Manufacturing,
    audience: "Best for asset-heavy businesses that need equipment control and maintenance scheduling.",
    fitSignals: ["Asset register", "Work orders", "Downtime tracking"],
    pains: [
      "Equipment records and maintenance history are scattered across different logs and spreadsheets.",
      "Breakdowns are reactive because preventive schedules are hard to track and enforce.",
      "Managers struggle to see which assets are costing the most in downtime and repairs.",
    ],
    capabilities: [
      {
        title: "Keep an active equipment register",
        copy: "Equipment meta, status, and maintenance history stay in one shared record.",
      },
      {
        title: "Manage work orders and breakdowns",
        copy: "Work orders and breakdown logging follow a clear lifecycle from report to resolution.",
      },
      {
        title: "Schedule preventive maintenance",
        copy: "Planned maintenance schedules reduce reactive firefighting and unplanned downtime.",
      },
      {
        title: "Track downtime and repair trends",
        copy: "Downtime codes and analytics help identify which assets need attention or replacement.",
      },
    ],
    outcomes: [
      "Reduced unplanned downtime",
      "Clearer maintenance scheduling",
      "Better asset lifecycle visibility",
    ],
    startWith: "Equipment register, work orders, and breakdown tracking.",
    expandWith: "Preventive schedules, downtime analytics, and compliance integration.",
    modules: ["Equipment", "Work orders", "Breakdowns", "Scheduling", "Analytics"],
    recommendedTier: "Growth",
    defaultAddOns: ["ADDON_MAINTENANCE_PRO"],
    category: "services",
  },
  {
    slug: "compliance",
    title: "Compliance",
    navLabel: "Compliance",
    eyebrow: "Compliance",
    headline: "Manage permits, inspections, incidents, and training records in one compliance system.",
    summary:
      "Built for businesses that need to stay ahead of regulatory requirements and safety obligations.",
    icon: Policy,
    audience: "Best for regulated industries that need permit tracking, inspections, and incident reporting.",
    fitSignals: ["Permit tracking", "Inspections", "Incident reporting"],
    pains: [
      "Permits, inspections, and training records are tracked in separate files and calendars.",
      "Compliance incidents are hard to investigate when context is spread across multiple tools.",
      "Audits are stressful because documentation is incomplete or hard to retrieve quickly.",
    ],
    capabilities: [
      {
        title: "Track permits and inspections",
        copy: "Permit lifecycle and inspection records stay organized and easy to review.",
      },
      {
        title: "Log and investigate incidents",
        copy: "Compliance incidents are captured with the context needed for follow-up and reporting.",
      },
      {
        title: "Manage training records and expiries",
        copy: "Training records and expiry tracking help the team stay ahead of compliance deadlines.",
      },
      {
        title: "Prepare for audits with cleaner records",
        copy: "Everything lives in one place, making audits faster and less error-prone.",
      },
    ],
    outcomes: [
      "Fewer missed compliance deadlines",
      "Faster incident investigation",
      "Less audit preparation stress",
    ],
    startWith: "Permits, inspections, and incident tracking.",
    expandWith: "Training records, deeper reporting, and multi-site compliance.",
    modules: ["Permits", "Inspections", "Incidents", "Training", "Reporting"],
    recommendedTier: "Growth",
    defaultAddOns: ["ADDON_COMPLIANCE_PRO"],
    category: "high-control",
  },
  {
    slug: "cctv-surveillance",
    title: "CCTV and Surveillance",
    navLabel: "CCTV",
    eyebrow: "CCTV and Surveillance",
    headline: "Monitor cameras, manage NVRs, review events, and control streams from one security hub.",
    summary:
      "Built for businesses that need real-time surveillance oversight, playback review, and centralized camera management.",
    icon: Camera,
    audience: "Best for multi-site operators, warehouses, and facilities that need centralized video security.",
    fitSignals: ["Live monitoring", "Playback review", "Camera management"],
    pains: [
      "Camera and NVR management is fragmented across different interfaces and locations.",
      "Finding and reviewing footage is time-consuming when playback tools are not centralized.",
      "Security teams lack a single view of live feeds, events, and access logs.",
    ],
    capabilities: [
      {
        title: "Centralize camera and NVR management",
        copy: "Camera inventory, NVR status, and stream health are visible from one dashboard.",
      },
      {
        title: "Support live monitoring and playback",
        copy: "Live streams and playback search are accessible without switching between systems.",
      },
      {
        title: "Track events and access logs",
        copy: "CCTV events and access logs create an audit trail for security review.",
      },
      {
        title: "Control streaming sessions",
        copy: "Stream tokens and session control keep live access secure and manageable.",
      },
    ],
    outcomes: [
      "Faster security incident review",
      "Centralized camera and NVR visibility",
      "Tighter control over live stream access",
    ],
    startWith: "Camera inventory, live monitoring, and event tracking.",
    expandWith: "Playback analytics, access control, and multi-site security dashboards.",
    modules: ["Cameras", "NVRs", "Live monitor", "Playback", "Events"],
    recommendedTier: "Business",
    defaultAddOns: ["ADDON_CCTV_SUITE"],
    category: "multi-site",
  },
  {
    slug: "stores-inventory",
    title: "Stores and Inventory",
    navLabel: "Stores",
    eyebrow: "Stores and Inventory",
    headline: "Manage stock movements, receiving, issuing, and fuel tracking across locations.",
    summary:
      "Built for businesses that need multi-site stock control, movement tracking, and fuel ledger management.",
    icon: Warehouse,
    audience: "Best for warehouses, yards, and facilities that need centralized inventory and fuel tracking.",
    fitSignals: ["Stock control", "Movements", "Fuel tracking"],
    pains: [
      "Stock records drift when movements, receipts, and issues are tracked in separate sheets.",
      "Fuel usage and stock levels are hard to reconcile without a shared ledger.",
      "Managers struggle to get a clear picture of stock across multiple locations.",
    ],
    capabilities: [
      {
        title: "Track stock movements in one flow",
        copy: "Receipts, issues, and transfers are logged and visible across all sites.",
      },
      {
        title: "Manage fuel ledgers",
        copy: "Fuel stock and usage are tracked alongside other inventory for clearer reconciliation.",
      },
      {
        title: "Support multi-site visibility",
        copy: "Centralized dashboards show stock levels and movement history per location.",
      },
      {
        title: "Reduce stock drift and errors",
        copy: "A shared process cuts down on manual errors and missing records.",
      },
    ],
    outcomes: [
      "Clearer multi-site stock visibility",
      "Fewer stock reconciliation errors",
      "Better fuel and inventory control",
    ],
    startWith: "Inventory tracking, movements, and receiving.",
    expandWith: "Fuel ledger, retail integration, and advanced reporting.",
    modules: ["Inventory", "Movements", "Receiving", "Issue", "Fuel ledger"],
    recommendedTier: "Starter",
    defaultAddOns: ["ADDON_STORES_CORE"],
    category: "retail",
  },
  {
    slug: "thrift-operations",
    title: "Thrift Operations",
    navLabel: "Thrift",
    eyebrow: "Thrift Operations",
    headline: "Control bale intake, grading, lot inventory, and resale for second-hand clothing.",
    summary:
      "Built for thrift and second-hand clothing businesses that need to track bales, grades, and sales from intake to resale.",
    icon: Checkroom,
    audience: "Best for thrift retailers and wholesalers managing bale-based inventory and resale.",
    fitSignals: ["Bale intake", "Grading", "Lot sales"],
    pains: [
      "Bale intake and grading records are hard to trace back to original cost and weight.",
      "Lot inventory drifts when sales and stock are not tied to bale source.",
      "Margins are unclear when landed costs are not connected to final resale price.",
    ],
    capabilities: [
      {
        title: "Track bale intake and landed cost",
        copy: "Capture gross and net weight, landed cost, and supplier details at intake.",
      },
      {
        title: "Grade into SKU lots",
        copy: "Bales are graded into sellable lots with traceability back to source.",
      },
      {
        title: "Manage lot inventory and sales",
        copy: "Lot stock levels and sales are tracked with oversell prevention.",
      },
      {
        title: "See margin and performance",
        copy: "Landed cost and resale price are connected for clearer margin tracking.",
      },
    ],
    outcomes: [
      "Clearer bale-to-sale traceability",
      "Tighter lot inventory control",
      "Better margin visibility",
    ],
    startWith: "Bale intake, grading, and lot inventory.",
    expandWith: "Retail/wholesale sales, finance integration, and reporting.",
    modules: ["Bale intake", "Grading", "Lot inventory", "Sales", "Margins"],
    recommendedTier: "Starter",
    defaultAddOns: ["ADDON_RETAIL_SUITE"],
    category: "retail",
  },
];

export function getSolutionPage(slug: string) {
  return solutionPages.find((solution) => solution.slug === slug);
}


export const buyerPainCards = [
  {
    title: "I don't know what I actually have in stock",
    description:
      "Your notebook says 50 cases. Your shelf says 32. Your supplier says you owe them for 60. Which number is right?",
  },
  {
    title: "My cash drawer never matches",
    description:
      "The till says $850. You counted $720. Is it theft? A mistake? A pricing error? You spend an hour figuring it out — and still aren't sure.",
  },
  {
    title: "I find out about problems too late",
    description:
      "The machine broke yesterday. The stock ran out last week. The employee didn't show up this morning. You only found out when someone told you.",
  },
];

export const customerOutcomeCards = [
  {
    title: "See your stock on your phone",
    description:
      "Check stock levels while you're at the supplier. Review shift reports while you're home. Know what's happening without being there.",
  },
  {
    title: "Connected sales, stock, and cash",
    description:
      "Every sale updates stock automatically. Every shift close shows expected vs. actual cash in 30 seconds. No more mysteries.",
  },
  {
    title: "Works even when the internet doesn't",
    description:
      "Your connection drops? No problem. Corelith stores data on your device and syncs when the internet comes back. Built for Zimbabwe realities.",
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
    description:
      "Track buying, dispatch, receipts, settlements, and reporting in one place when control cannot be loose.",
  },
  {
    icon: Recycle,
    title: "Scrap and recycling",
    description:
      "Keep yard stock, buying, pricing, and bulk sales easier to follow across teams and locations.",
  },
  {
    icon: Building2,
    title: "Schools",
    description:
      "Bring admissions, attendance, fees, notices, and portals into one system instead of separate admin tools.",
  },
  {
    icon: DirectionsCar,
    title: "Auto sales",
    description:
      "See leads, stock, deal progress, and financing handoffs without losing track between departments.",
  },
  {
    icon: ReceiptLong,
    title: "Retail and POS",
    description:
      "Keep catalog, pricing, receiving, refunds, shift close, and stock control working from the same process.",
  },
  {
    icon: Camera,
    title: "Multi-site operations",
    description:
      "Bring people, stock, maintenance, CCTV, and reporting together as the business expands beyond one site.",
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
  "Extra User Pack",
  "Extra Site",
  "White-label & Custom Domain",
];

export const featuredAddOns = [
  {
    name: "Extra User Pack",
    price: "$19/mo",
    note: "5 additional users. Add as many packs as you need.",
  },
  {
    name: "Extra Site",
    price: "$25/mo",
    note: "1 additional business location.",
  },
  {
    name: "White-label & Custom Domain",
    price: "$39/mo",
    note: "Your logo, colors, and domain.",
  },
];

export const rolloutPaths = [
  {
    title: "Retail and shop rollout",
    start: "POS, stock, sales control, and shift close.",
    expand: "Purchasing, promotions, accounting, and deeper reporting.",
  },
  {
    title: "School or service rollout",
    start: "Admissions, attendance, fees, and student records.",
    expand: "Portals, results, boarding, and finance controls.",
  },
  {
    title: "Mining or scrap yard rollout",
    start: "Buying, dispatch, receipts, and settlement tracking.",
    expand: "Compliance, maintenance, analytics, and finance controls.",
  },
];

export const trustClaims = [
  "Works offline when the internet drops — built for Zimbabwe connectivity",
  "Mobile-first — runs on any phone, tablet, or computer",
  "Start at $39/month — less than most businesses lose to one stock error",
  "Set up in 5 minutes, not 5 days",
  "All workflows already built — retail, schools, gold, scrap, auto, maintenance, compliance",
  "Add more capability without replacing the whole system",
];

export const audienceSignals = [
  "You run a business in Zimbabwe and need better control",
  "Important work still moves through notebooks, WhatsApp, and memory",
  "Cash, stock, or attendance need tighter tracking",
  "You want to see what's happening without being at every site",
  "You want to start small and expand when ready",
];

export const demoHighlights = [
  "Start your 14-day free trial — no credit card needed.",
  "See the exact workflow that matters to your business.",
  "Add your real data in minutes, not hours.",
  "Get a practical rollout plan before you leave.",];

export const demoPreparationItems = [
  "Your biggest daily headache (stock, sales, attendance, gold tracking).",
  "How many sites or branches you run.",
  "How many people need access.",
  "What you're using now (notebook, spreadsheet, other software).",
];

export const demoOutcomeItems = [
  "We reply with a recommended plan and setup steps.",
  "You get a free trial link to test with your real data.",
  "You decide if it's worth it — no pressure.",
];

export const demoConfidencePoints = [
  "14-day free trial, no credit card",
  "Tailored to your workflow, not a generic tour",
  "Clear next step before you leave",
];

// Product page deep-dive content
export const guardrailCards = [
  {
    eyebrow: "Tenant isolation",
    title: "Hard companyId partition on every record.",
    copy: "Every query is scoped to the active tenant. There is no accidental cross-tenant access, ever.",
  },
  {
    eyebrow: "Route gating",
    title: "Feature-key route registry enforces access.",
    copy: "Every route maps to a feature key. If a team does not have the feature, the route is blocked at the edge.",
  },
  {
    eyebrow: "Workflow locks",
    title: "State-machine guards on critical transitions.",
    copy: "Deal stages, results moderation, and bed allocations use transactional locks to prevent invalid moves.",
  },
  {
    eyebrow: "Finance integrity",
    title: "Idempotency keys on all money-impacting events.",
    copy: "Every finance-impacting action emits a deterministic accounting event that can be traced and replayed safely.",
  },
];

export const postingEngineCards = [
  {
    eyebrow: "Event-driven",
    title: "Operations emit accounting integration events.",
    copy: "Stock movements, sales, and payouts automatically trigger the correct journal entries without manual re-entry.",
  },
  {
    eyebrow: "Deterministic",
    title: "Journal postings are traceable to source operations.",
    copy: "Every ledger line links back to the operation that created it. Audits become faster and cleaner.",
  },
  {
    eyebrow: "Regulatory ready",
    title: "ZIMRA fiscalisation hooks built in.",
    copy: "Tax invoices and fiscal receipts are generated and tracked as part of the normal sales workflow.",
  },
  {
    eyebrow: "No drift",
    title: "Finance and operations stay in sync.",
    copy: "Because the posting engine lives in the same system as the operations, reconciliation time drops dramatically.",
  },
];

export const moduleRegistryItems = [
  { name: "Operations", purpose: "Shift reports, attendance, and plant reports.", verticals: ["All"] },
  { name: "Gold", purpose: "Intake, dispatch, receipt, settlement, and reconciliation.", verticals: ["Gold"] },
  { name: "Retail", purpose: "POS, catalog, purchasing, promotions, and shifts.", verticals: ["Retail", "Thrift"] },
  { name: "Schools", purpose: "Admissions, attendance, fees, boarding, results, and portals.", verticals: ["Schools"] },
  { name: "Scrap & Recycling", purpose: "Buying, yard stock, pricing, and bulk sales.", verticals: ["Scrap"] },
  { name: "Auto Sales", purpose: "Leads, inventory, deals, and financing.", verticals: ["Auto"] },
  { name: "HR & Payroll", purpose: "Employees, compensation, payroll, and disbursements.", verticals: ["All"] },
  { name: "Maintenance", purpose: "Equipment, work orders, breakdowns, and scheduling.", verticals: ["All"] },
  { name: "Compliance", purpose: "Permits, inspections, incidents, and training.", verticals: ["All"] },
  { name: "CCTV", purpose: "Cameras, NVRs, live monitoring, playback, and events.", verticals: ["All"] },
  { name: "Stores & Inventory", purpose: "Stock movements, receiving, issuing, and fuel.", verticals: ["All"] },
  { name: "Reporting", purpose: "Cross-domain dashboards and analytics.", verticals: ["All"] },
  { name: "Portals", purpose: "Parent, student, teacher, and POS portals.", verticals: ["Schools", "Auto", "Retail"] },
];

// Pricing calculator data
export const calculatorVerticals = solutionPages.map((s) => ({
  slug: s.slug,
  title: s.title,
  navLabel: s.navLabel,
  icon: s.icon,
  recommendedTier: s.recommendedTier,
  defaultAddOns: s.defaultAddOns,
}));

export const calculatorAddOns: Array<{
  code: string;
  name: string;
  category: string;
  base: number;
  perSite: number;
}> = FEATURE_BUNDLES.filter((b) => b.monthlyPrice > 0 || b.additionalSiteMonthlyPrice > 0).map(
  (b: FeatureBundleDefinition) => ({
    code: b.code,
    name: b.name,
    category: b.name.includes("Accounting")
      ? "Finance"
      : b.name.includes("Gold")
        ? "Gold"
        : b.name.includes("School")
        ? "Schools"
        : b.name.includes("Retail") || b.name.includes("Portal")
        ? "Operations"
        : b.name.includes("CCTV")
        ? "Security"
        : b.name.includes("Maintenance")
        ? "Maintenance"
        : b.name.includes("Compliance")
        ? "Compliance"
        : b.name.includes("Payroll") || b.name.includes("User")
        ? "Workforce"
        : b.name.includes("Analytics") || b.name.includes("Branding")
        ? "Platform"
        : "Operations",
    base: b.monthlyPrice,
    perSite: b.additionalSiteMonthlyPrice,
  }),
);

export const tierComparisonRows = [
  { label: "Included sites", basic: "1", standard: "3", enterprise: "8" },
  { label: "Extra site rate", basic: "$90/mo", standard: "$140/mo", enterprise: "$220/mo" },
  { label: "Core operations", basic: "Included", standard: "Included", enterprise: "Included" },
  { label: "HR incidents & compliance", basic: "—", standard: "Included", enterprise: "Included" },
  { label: "Payroll & disbursements", basic: "—", standard: "—", enterprise: "Included" },
  { label: "Analytics Pro", basic: "Add-on", standard: "Add-on", enterprise: "Included" },
  { label: "Priority support", basic: "—", standard: "Email", enterprise: "Dedicated" },
];
