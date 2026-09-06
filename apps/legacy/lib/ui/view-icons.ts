import {
  AddressBook,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  Camera,
  Check,
  CheckCircle,
  ChartLine,
  Checklist,
  Clock,
  Coins,
  Dashboard,
  Dataset,
  DirectionsCar,
  Download,
  EventNote,
  Factory,
  FileCheck,
  FileText,
  Fuel,
  Funnel,
  Gem,
  GitCompare,
  Globe,
  Grid3x3,
  History,
  Home,
  Layers,
  ListBullets,
  LocalShipping,
  MapPin,
  Package,
  Palette,
  Payments,
  Phone,
  Receipt,
  ReceiptLong,
  Recycle,
  RefreshCcw,
  ReportProblem,
  Rule,
  Scale,
  Server,
  Settings2,
  Shield,
  ShieldCheck,
  Storefront,
  TrendingUp,
  Upload,
  UserCheck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
} from "@/lib/icons";

/**
 * A mark for every rail entry, without hand-editing a hundred call sites.
 *
 * Every module's view switcher is a rail of bare words. A rail of bare words
 * is a rail you read top to bottom every time, because there is nothing to
 * aim at — and the icons are exactly the thing that turns "find Receipts" from
 * reading into pointing.
 *
 * The obvious fix is to add an icon to each of the hundred-odd items scattered
 * across the app, which is a hundred chances to pick a different icon for the
 * same idea. View ids are already a controlled vocabulary — `invoices` means
 * invoices in accounting, in schools, and in the CRM — so the mapping lives
 * here once and every rail gets it for free. A caller with something specific
 * to say still passes its own icon and wins.
 */
const BY_KEY: Record<string, LucideIcon> = {
  // Money in
  invoices: FileText,
  "fee-invoice": FileText,
  receipts: Receipt,
  "sales-receipts": ReceiptLong,
  "credit-notes": FileText,
  // Money the business is holding on somebody else's behalf — a school fee
  // overpayment, most often. A wallet rather than a document, because a credit
  // is a balance, not a piece of paper.
  credits: Wallet,
  "debit-notes": FileText,
  payments: Payments,
  "purchase-payments": Payments,
  "supplier-payments": Payments,
  refund: RefreshCcw,
  refunds: RefreshCcw,
  "write-offs": Scale,
  void: AlertTriangle,
  statements: FileText,
  collections: Scale,
  arrears: Clock,
  aging: Clock,
  "ap-aging": Clock,
  "ar-aging": Clock,
  "approval-aging": Clock,
  quotes: FileText,
  bills: FileText,
  waivers: Scale,
  fees: Coins,
  structures: Layers,

  // Ledger and reporting
  coa: Dataset,
  journals: EventNote,
  ledger: Dataset,
  balance: Scale,
  "trial-balance": Scale,
  profit: TrendingUp,
  "cash-flow": ChartLine,
  budgets: Wallet,
  "cost-centers": Layers,
  "financial-home": ChartLine,
  "financial-statements": ChartLine,
  "receivables-home": ChartLine,
  reports: ChartLine,
  dashboard: Dashboard,
  overview: Dashboard,
  insights: BarChart3,
  variance: BarChart3,
  balances: Scale,
  transactions: Dataset,
  reconciliation: GitCompare,
  reconciliations: GitCompare,
  currency: Coins,
  tax: Scale,
  codes: Scale,
  "vat-returns": FileCheck,
  "vat-summary": FileCheck,
  fiscalisation: FileCheck,

  // People
  customers: AddressBook,
  vendors: Building2,
  suppliers: Building2,
  people: Users,
  users: Users,
  admins: ShieldCheck,
  students: Users,
  guardians: Users,
  children: Users,
  employees: Users,
  departments: Layers,
  groups: Layers,
  teams: Users,
  role: ShieldCheck,
  roles: ShieldCheck,
  access: ShieldCheck,
  features: ShieldCheck,
  permissions: ShieldCheck,
  admin: Shield,
  compensation: Wallet,
  employment: UserCheck,
  attendance: CalendarCheck,
  "attendance-register": CalendarCheck,
  shifts: Clock,
  schedules: CalendarCheck,
  sessions: Clock,
  leave: CalendarCheck,

  // Sales and pipeline
  leads: Funnel,
  deals: Funnel,
  pipeline: Funnel,
  sale: Storefront,
  sales: Storefront,
  contracts: FileText,
  renewals: RefreshCcw,
  "at-risk": AlertTriangle,
  launch: Zap,

  // Stock and operations
  inventory: Warehouse,
  stock: Warehouse,
  catalog: Package,
  catalogue: Package,
  categories: Layers,
  bundles: Layers,
  movements: LocalShipping,
  dispatches: LocalShipping,
  locations: MapPin,
  sites: MapPin,
  rooms: Home,
  hostels: Home,
  boarding: Home,
  occupancy: Home,
  materials: Recycle,
  fuel: Fuel,
  wac: Scale,
  batches: Layers,
  lines: ListBullets,
  allocations: Layers,
  assignments: Checklist,
  operations: Factory,
  purchases: Package,
  requests: Checklist,
  workspace: Grid3x3,
  workspaces: Grid3x3,
  modules: Grid3x3,
  addons: Grid3x3,

  // Health and exceptions
  exceptions: ReportProblem,
  incidents: AlertTriangle,
  critical: AlertTriangle,
  low: AlertTriangle,
  missing: AlertTriangle,
  ok: CheckCircle,
  ready: CheckCircle,
  health: ShieldCheck,
  failures: ReportProblem,
  audit: History,
  simulation: Zap,
  rules: Rule,
  "rule-library": Rule,
  runbooks: FileText,
  protocols: FileText,
  mappings: GitCompare,
  templates: FileText,
  template: FileText,
  config: Settings2,
  general: Settings2,
  identity: Building2,
  branding: Palette,
  network: Globe,
  emergency: Bell,
  notices: Bell,

  // Time buckets, for queues grouped by when
  today: CalendarCheck,
  tomorrow: CalendarCheck,
  yesterday: History,
  "this-week": CalendarCheck,
  "last-week": History,
  earlier: History,
  later: Clock,
  due: Clock,
  "past-due": AlertTriangle,
  overdue: AlertTriangle,
  awaiting: Clock,
  queue: ListBullets,
  closed: Check,
  published: CheckCircle,
  committed: CheckCircle,
  review: Checklist,
  intake: Download,
  inbound: Download,
  outbound: Upload,
  seed: Dataset,
  welcome: Home,

  // Schools
  academics: Dataset,
  classes: Users,
  "class-list": Users,
  subjects: Dataset,
  enrollment: UserCheck,
  enrollments: UserCheck,
  results: Dataset,
  "report-card": FileText,

  // Estate
  assets: Warehouse,
  documents: FileText,
  finance: Coins,
  banking: Wallet,
  accounts: Wallet,
  cameras: Camera,
  nvrs: Server,
  streams: Camera,
  live: Camera,
  vehicles: DirectionsCar,
  maintenance: Wrench,
  gold: Gem,
  phone: Phone,
};

/** Words that decide an icon when the id itself is not in the table. */
const BY_KEYWORD: Array<[RegExp, LucideIcon]> = [
  [/invoice/, FileText],
  [/receipt/, Receipt],
  [/payment|payout|disburse/, Payments],
  [/aging|overdue|due/, Clock],
  [/report|statement/, ChartLine],
  [/customer|client|contact/, AddressBook],
  [/supplier|vendor|company|companies/, Building2],
  [/user|people|person|student|staff|employee/, Users],
  [/stock|inventory|warehouse/, Warehouse],
  [/product|catalog/, Package],
  [/tax|vat|compliance/, FileCheck],
  [/exception|error|fail|problem|risk/, ReportProblem],
  [/setting|config/, Settings2],
  [/permission|access|role|security/, ShieldCheck],
  [/schedule|calendar|appointment|visit/, CalendarCheck],
  [/history|log|audit/, History],
  [/rule|automation|workflow/, Rule],
];

const FALLBACK: LucideIcon = ListBullets;

/**
 * The icon for a rail entry, given whatever the caller knows about it.
 *
 * Falls through id, then label, then keyword — so a view called `ar-aging`
 * labelled "AR Aging" and one called `bucket3` labelled "Overdue invoices"
 * both end up with something that means what they are.
 */
export function resolveViewIcon(id: string, label?: string): LucideIcon {
  const key = id.trim().toLowerCase();
  const direct = BY_KEY[key];
  if (direct) return direct;

  const labelKey = (label ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  const byLabel = BY_KEY[labelKey];
  if (byLabel) return byLabel;

  const haystack = `${key} ${label ?? ""}`.toLowerCase();
  for (const [pattern, icon] of BY_KEYWORD) {
    if (pattern.test(haystack)) return icon;
  }

  return FALLBACK;
}
