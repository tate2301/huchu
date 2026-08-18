import {
  ArrowRightLeft,
  BarChart3,
  Building2,
  Calendar,
  ChartLine,
  CheckCircle,
  ClipboardList,
  Coins,
  Dashboard,
  Factory,
  FileText,
  History,
  LifeBuoy,
  LocalShipping,
  Mail,
  Megaphone,
  Package,
  PackageCheck,
  Payments,
  ReceiptLong,
  ShieldCheck,
  Storefront,
  TrendingUp,
  Users,
  Wallet,
  Warehouse,
  WifiOff,
  Work,
  Wrench,
  type LucideIcon,
} from "@/lib/icons";
import {
  ANNUAL_DISCOUNT_LABEL,
  ANNUAL_PREPAY_COPY,
  MARKETING_TIERS,
  SCHOOL_STARTING_TERM_PRICE,
  STARTING_ANNUAL_MONTHLY_PRICE,
  STARTING_MONTHLY_PRICE,
  formatUsd,
  getMarketingTier,
  productPriceLabel,
} from "@/lib/marketing/pricing";

// Prices in copy are read from the billing catalog through
// `lib/marketing/pricing.ts` rather than typed out, so a tier change never
// leaves a stale figure in a headline or a meta description. Annual is the ask
// (PR-2.1), so copy quotes the annual rate first and the monthly rate second.

/** Fails the build rather than rendering a page with a missing plan in it. */
function tierByCode(code: string) {
  const tier = getMarketingTier(code);
  if (!tier) throw new Error(`Marketing copy references unknown tier ${code}`);
  return tier;
}

const fiscalTier = tierByCode("FISCAL");
const startTier = tierByCode("START");
const scaleTier = tierByCode("SCALE");

export type SeoEntry = {
  title: string;
  description: string;
  path: string;
  keywords: string[];
};

export type SectionIntro = {
  eyebrow: string;
  title: string;
  copy: string;
};

export type ProductVisual = {
  eyebrow: string;
  title: string;
  status: string;
  metrics: Array<{ label: string; value: string; detail: string }>;
  primaryRows: Array<{ label: string; value: string; meta: string }>;
  secondaryRows: Array<{ label: string; value: string; tone: "neutral" | "warn" | "success" }>;
};

/**
 * A customer segment with its own page under `/home/solutions`.
 *
 * Every segment runs the same order-to-cash loop — the landing page sells that
 * loop once, and these entries only describe how each business shapes the
 * `deliver` step in the middle of it. Schools are deliberately not a segment:
 * they buy per term against enrolment and live at `/home/schools`.
 */
export type MarketingSegment = {
  slug: string;
  legacySlugs: string[];
  /** Key into `PRODUCT_COMMERCIALS` in `lib/marketing/pricing.ts`. */
  pricingSlug: string;
  title: string;
  navTitle: string;
  /** Plain-language list of the businesses this covers. Used in nav and cards. */
  who: string;
  eyebrow: string;
  headline: string;
  summary: string;
  audience: string;
  cta: string;
  whatsapp: string;
  icon: LucideIcon;
  /** How this business shapes the `deliver` step of the shared loop. */
  deliverStep: { label: string; copy: string };
  /** The segment's own six-step operating motion. */
  workflow: string[];
  /**
   * Some segments run the same loop two materially different ways — a counter
   * sale and an account sale are the same concept with a different motion.
   * Only set where the difference changes what the buyer needs to see.
   */
  modes?: Array<{
    name: string;
    who: string;
    copy: string;
    steps: string[];
    icon: LucideIcon;
  }>;
  /** Three sharp lines shown in the landing-page segment switcher. */
  landingPains: string[];
  /**
   * The five section intros on this trade's page. Held per trade rather than
   * hardcoded once, so a workshop page argues like a workshop instead of
   * repeating a generic line under a different heading.
   */
  sectionIntros: {
    pains: SectionIntro;
    workflow: SectionIntro;
    capabilities: SectionIntro;
    outcomes: SectionIntro;
    commercials: SectionIntro;
  };
  seo: SeoEntry;
  productVisual: ProductVisual;
  pains: string[];
  capabilities: Array<{ title: string; copy: string; icon: LucideIcon }>;
  outcomes: string[];
  proofMetrics: Array<{ value: string; label: string }>;
  modules: string[];
};

export const WHATSAPP_NUMBER = "263784939111";
export const WHATSAPP_DISPLAY = "+263 78 493 9111";

export function whatsappHref(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const navItems = [
  { label: "Product", href: "/home/products" },
  { label: "Solutions", href: "/home/solutions" },
  { label: "Pricing", href: "/home/pricing" },
  { label: "Schools", href: "/home/schools" },
  { label: "Company", href: "/home/about" },
];

export const footerGroups = [
  {
    title: "Product",
    links: [
      { label: "Platform overview", href: "/home/products" },
      { label: "Pricing", href: "/home/pricing" },
      { label: "Implementation", href: "/home/implementation-support" },
      { label: "FAQ", href: "/home/faq" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Sellers", href: "/home/solutions/sellers" },
      { label: "Service providers", href: "/home/solutions/service-providers" },
      { label: "Workshops", href: "/home/solutions/workshops" },
      { label: "Manufacturers", href: "/home/solutions/manufacturers" },
      { label: "Sales teams", href: "/home/solutions/sales-teams" },
      { label: "Schools", href: "/home/schools" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/home/about" },
      { label: "Contact", href: "/home/contact" },
      { label: "Founding partner", href: "/home/founding-partner" },
      { label: "Privacy", href: "/home/privacy" },
      { label: "Terms", href: "/home/terms" },
    ],
  },
];

const HOME_DESCRIPTION =
  `Corelith puts sales, stock, jobs, invoices and cash on one record. Built in Zimbabwe, works offline, ZIMRA fiscalisation built in. From ${formatUsd(STARTING_ANNUAL_MONTHLY_PRICE)} a month paid annually.`;

export const seoPages = {
  home: {
    title: "Find the money your business is losing",
    description: HOME_DESCRIPTION,
    path: "/home",
    keywords: [
      "business software Zimbabwe",
      "stock control software Zimbabwe",
      "invoicing and inventory software Zimbabwe",
      "job card software Zimbabwe",
      "manufacturing software Zimbabwe",
      "sales CRM Zimbabwe",
      "POS system Zimbabwe",
      "bottle store software Zimbabwe",
      "ZIMRA fiscalisation software",
    ],
  },
  root: {
    title: "Find the money your business is losing",
    description: HOME_DESCRIPTION,
    path: "/",
    keywords: [
      "business software Zimbabwe",
      "stock control software Zimbabwe",
      "invoicing software Zimbabwe",
      "job card software Zimbabwe",
      "sales CRM Zimbabwe",
    ],
  },
  platform: {
    title: "The Corelith platform",
    description:
      "One record every part of the business reads. Sell, Stock, Work, Books and People, plus the industry packs and add-ons you switch on when they pay for themselves.",
    path: "/home/products",
    keywords: [
      "business platform Zimbabwe",
      "inventory accounting CRM software",
      "ERP modules Zimbabwe",
      "Corelith modules and features",
    ],
  },
  solutions: {
    title: "Corelith by trade",
    description:
      "A shop, a garage and a maize mill lose money in different places. Pick the trade that looks like your business and see what closing that gap is worth.",
    path: "/home/solutions",
    keywords: [
      "retail wholesale software Zimbabwe",
      "service business software Zimbabwe",
      "workshop management software Zimbabwe",
      "manufacturing software Zimbabwe",
      "sales team CRM Zimbabwe",
    ],
  },
  pricing: {
    title: "Corelith pricing",
    description:
      `Priced per site, never per user. From ${formatUsd(STARTING_ANNUAL_MONTHLY_PRICE)} a month paid annually, ${formatUsd(STARTING_MONTHLY_PRICE)} month to month, with every seat included up to your ceiling. Onboarding is a published one-off. 30-day money-back guarantee.`,
    path: "/home/pricing",
    keywords: [
      "Corelith pricing",
      "ERP pricing Zimbabwe",
      "business software cost Zimbabwe",
      "per site pricing software",
      "ZIMRA fiscalisation pricing Zimbabwe",
    ],
  },
  schools: {
    title: "Corelith for schools",
    description:
      `Collect the fees you are owed and keep one record of every child. Admissions, fees, academics, boarding and parent portals, priced per campus per term from ${formatUsd(SCHOOL_STARTING_TERM_PRICE)}.`,
    path: "/home/schools",
    keywords: [
      "school management software Zimbabwe",
      "school fees system Zimbabwe",
      "student information system Zimbabwe",
      "parent portal Zimbabwe",
      "school ERP Zimbabwe",
    ],
  },
  implementation: {
    title: "Getting it live",
    description:
      "Software nobody finished setting up saves you nothing. Thirty days of scoped work: mapping, configuration, data import, training and go-live support.",
    path: "/home/implementation-support",
    keywords: [
      "software implementation Zimbabwe",
      "ERP onboarding Zimbabwe",
      "business software migration",
      "Corelith Launch Sprint",
    ],
  },
  foundingPartner: {
    title: "Founding Partner Programme",
    description:
      "Discounted setup and your rate held for twelve months, in exchange for a rollout that goes properly and honest feedback about how it went.",
    path: "/home/founding-partner",
    keywords: [
      "Corelith founding partner",
      "Zimbabwe business software pilot",
      "workshop software pilot",
      "business software launch programme",
    ],
  },
  bookDemo: {
    title: "Find your Corelith setup",
    description:
      "Tell us where the money goes and we will show you the part that stops it. About a minute of questions, then a demo on your trade with your kind of numbers in it.",
    path: "/home/book-demo",
    keywords: [
      "book Corelith demo",
      "business software demo Zimbabwe",
      "inventory software demo",
      "workshop software demo",
    ],
  },
  about: {
    title: "About Corelith",
    description:
      "Most businesses here are more profitable than their records make them look. Corelith is built in Harare for owners running three to sixty staff across one to eight sites.",
    path: "/home/about",
    keywords: [
      "Corelith Zimbabwe",
      "Hurudza Labs",
      "African business software",
      "Zimbabwe software company",
    ],
  },
  contact: {
    title: "Contact Corelith",
    description:
      "Ask us what it would cost you and what it would save you. WhatsApp, email or a demo set up properly first. No shortlist or budget required.",
    path: "/home/contact",
    keywords: [
      "contact Corelith",
      "Corelith WhatsApp",
      "business software Zimbabwe contact",
    ],
  },
  faq: {
    title: "Corelith FAQ",
    description:
      "Straight answers on price, per-site billing, migration, offline use, ZIMRA fiscalisation, staff adoption and what happens the week after go-live.",
    path: "/home/faq",
    keywords: [
      "Corelith FAQ",
      "business software migration Zimbabwe",
      "Corelith implementation",
      "ZIMRA fiscalisation software",
    ],
  },
  privacy: {
    title: "Privacy",
    description:
      "How Corelith handles marketing enquiries, demo requests, contact details and business information shared through the website.",
    path: "/home/privacy",
    keywords: ["Corelith privacy", "Corelith data protection"],
  },
  terms: {
    title: "Terms",
    description:
      "Website terms for Corelith marketing information, demo requests, pricing indications and implementation conversations.",
    path: "/home/terms",
    keywords: ["Corelith terms", "Corelith website terms"],
  },
} satisfies Record<string, SeoEntry>;

// ---------------------------------------------------------------------------
// The story: money you already earned, leaving through a gap you cannot see
// ---------------------------------------------------------------------------

/**
 * The intersection.
 *
 * A bottle store, a garage, a cleaning company, a maize mill and a field sales
 * team look nothing alike and have exactly one thing in common: each of them is
 * losing money it has already earned, through a gap nobody can see from where
 * they sit. That is the problem the landing page sells against — not "six steps",
 * which is a process story, and not one every business recognises.
 *
 * Every entry names the business type in its own words, so a reader finds
 * themselves in the list rather than being told which category they belong to.
 */
export const MONEY_LEAKS = [
  {
    where: "In the drawer",
    who: "Bottle stores, liquor outlets, kiosks, tuckshops, supermarkets, forecourts, bars",
    copy: "The count at close is $40 short and the shift has already gone home. Twice a week for a year is a cashier's wage paid to nobody.",
    icon: Storefront,
  },
  {
    where: "On the shelf",
    who: "Hardware, spare parts, agro-dealers, wholesale, distribution",
    copy: "Capital asleep in lines that have not moved since March, while the fast seller is out of stock again. One of those is cash you cannot touch, the other is cash walking to the shop down the road.",
    icon: Package,
  },
  {
    where: "In work nobody billed",
    who: "Cleaning, security, IT, logistics, plant hire, contractors, consultancies",
    copy: "Your team did the extra visits, the callout, the emergency job. The client got all of it and the invoice only carried the contract line.",
    icon: Work,
  },
  {
    where: "In parts and hours",
    who: "Garages, panel beaters, fitment centres, equipment repair",
    copy: "A filter and two litres of oil leave the store on a promise and never reach a job card. Labour gets rounded down at invoice time because nobody wrote the hours while the work was happening.",
    icon: Wrench,
  },
  {
    where: "In wastage and guesswork",
    who: "Food and beverage, fabrication, packaging, furniture, assembly",
    copy: "You price the order on what a unit felt like it cost last time. If that run wasted more than you thought, you find out at stock-take, months after you agreed the price.",
    icon: Factory,
  },
  {
    where: "In deals that went quiet",
    who: "Field sales, distributor reps, account teams, dealership floors",
    copy: "A quote went out and nobody chased it. The same stock got promised to two customers, and commission turns into an argument at month end.",
    icon: Megaphone,
  },
];

/** The line that turns six separate leaks into one problem. */
export const MONEY_LEAK_CLOSE =
  "Six trades, one hole. In every case it is money you have already earned, leaving through a gap you cannot see from the office.";

/**
 * Why the gap exists. Not a software problem — an evidence problem.
 */
export const problemFragments = [
  {
    label: "WhatsApp",
    copy: "Prices, orders and approvals get agreed in chats. Three weeks later the customer disputes the figure and nobody can find it.",
    icon: Users,
  },
  {
    label: "Excel",
    copy: "The real numbers live in one file, on one laptop, kept by one person. When that person is away, the business guesses.",
    icon: FileText,
  },
  {
    label: "Paper books",
    copy: "Delivery notes, job cards and receipts have to be typed up before anyone can read them, so the truth is always a few days behind the money.",
    icon: ReceiptLong,
  },
  {
    label: "A till that talks to nothing",
    copy: "It takes the cash and tells no one. Purchasing, costing and the books find out later, if at all.",
    icon: Storefront,
  },
  {
    label: "Staff memory",
    copy: "The real process lives in people's heads. It leaves through the gate when they resign, and you train the replacement from scratch.",
    icon: ClipboardList,
  },
];

export const connectedOutcomes = [
  "One customer record",
  "One stock figure",
  "One set of books",
  "One number everybody is working from",
];

export const CONNECTED_OUTCOMES_CLOSE =
  "Everything writes to the same record, so your figures stop disagreeing with each other and you stop paying for the argument.";

// ---------------------------------------------------------------------------
// The mechanism: one trail behind every dollar
// ---------------------------------------------------------------------------

/**
 * How the gap gets closed. Shown after the money story, as the mechanism rather
 * than the pitch — a reader who has just recognised their own leak wants to know
 * what actually stops it.
 */
export const MONEY_TRAIL = [
  {
    step: "Someone asks",
    copy: "A walk-in, a phone call, a WhatsApp message. It lands on a customer record instead of in somebody's phone.",
    icon: Megaphone,
  },
  {
    step: "You price it",
    copy: "Quote off live stock and your real costs, so you know the margin before you send the number rather than after.",
    icon: FileText,
  },
  {
    step: "They say yes",
    copy: "The quote becomes an order carrying the deposit, the deadline and an owner. Nothing gets promised to two customers.",
    icon: ClipboardList,
  },
  {
    step: "You deliver",
    copy: "Stock goes out, the job gets done, the batch gets made. This is the only step that looks different from trade to trade.",
    icon: LocalShipping,
  },
  {
    step: "You bill",
    copy: "The invoice is built from what actually moved, not from what the quote guessed, and fiscalised where ZIMRA requires it.",
    icon: ReceiptLong,
  },
  {
    step: "You get paid",
    copy: "Receipts, part-payments and balances land on the customer and post into the books in one action.",
    icon: Coins,
  },
];

/** What closes itself once the trail runs in one place. This is the payoff. */
export const TRAIL_PAYOFF = [
  {
    label: "Stock",
    copy: "What the system says you hold is what is on the shelf, every day, not just on count day.",
  },
  {
    label: "Books",
    copy: "Sales, purchases and payments post themselves, so your accountant stops rebuilding the year from a box of paper.",
  },
  {
    label: "Names",
    copy: "Every record carries who created it, who approved it and who changed it.",
  },
  {
    label: "Answers",
    copy: "Margin, ageing, stock cover and cash-up variance are pages you open, not a weekend you lose.",
  },
];

/**
 * Counter trade is not an afterthought, it is the shortest version of the trail.
 *
 * At a till there is no quote and no order — the customer walks in, pays and
 * leaves. Saying otherwise loses every bottle store, kiosk and forecourt on the
 * first screen. Same concept, three steps instead of six, and the money moves
 * behind the counter rather than in front of it.
 */
export const COUNTER_TRADE = {
  eyebrow: "Selling over a counter?",
  title: "Three steps, not six. Your money moves faster, so it matters more.",
  copy:
    "There is no quote and no invoice at a till. The sale is the whole front half, which means everything protecting your cash happens in the second after the customer walks out.",
  who: "Bottle stores and liquor outlets, kiosks, tuckshops, supermarkets, forecourts, bars and fast-service counters.",
  steps: [
    {
      step: "Ring it up",
      copy: "Scan or tap, take cash, card, EcoCash or a split payment, and print the fiscal receipt.",
      icon: Storefront,
    },
    {
      step: "Stock drops",
      copy: "The bottle leaves the shelf on the system at the same second it leaves the shelf in the shop.",
      icon: Package,
    },
    {
      step: "The shift closes",
      copy: "Cash counted against expected, variance by till and by cashier, before anybody goes home.",
      icon: Coins,
    },
  ],
  proof: [
    { value: "Offline", label: "Keeps selling through load-shedding, syncs when the line returns" },
    { value: "Per cashier", label: "Cash-up variance you can act on the same night" },
    { value: "Fiscalised", label: "ZIMRA receipts issued from the sale itself" },
  ],
} as const;

/** Honest, checkable claims. No logos, no invented testimonials. */
export const trustSignals = [
  { label: "Priced per site, never per user", icon: Users },
  { label: "Keeps selling when the internet drops", icon: WifiOff },
  { label: "ZIMRA fiscalisation built in", icon: ShieldCheck },
  { label: "Built and supported in Zimbabwe", icon: Building2 },
];

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

export const segments: MarketingSegment[] = [
  {
    slug: "sellers",
    legacySlugs: ["commerce", "retail-wholesale"],
    pricingSlug: "sellers",
    title: "Sellers",
    navTitle: "Sellers",
    who: "Bottle stores, kiosks, forecourts, supermarkets, hardware, spare parts, wholesale",
    eyebrow: "Shops, bottle stores, hardware, wholesale",
    headline: "Know what you hold, what it cost, and what it made you.",
    summary:
      "A sale drops the stock, books the margin and posts to the ledger in the same second the customer pays. So the shelf, the till and the report finally agree, and short cash stops being something you find out about weeks later.",
    audience:
      "Bottle stores, liquor outlets, kiosks, tuckshops, supermarkets, bars and forecourts selling over a counter. Hardware, spare parts, agro-dealers, pharmacies, wholesalers and distributors selling on account. Plenty of you do both.",
    cta: "See it running a shop",
    whatsapp:
      "Hi Corelith, I run a shop, bottle store or wholesale business. What would this cost me and what would it fix?",
    icon: Storefront,
    deliverStep: {
      label: "Pick and hand over",
      copy: "The stock leaves the shelf against the sale, and your on-hand figure, your cost of sale and your margin all move at the same moment.",
    },
    workflow: ["Order", "Check stock", "Pick and issue", "Invoice", "Payment", "Reorder"],
    modes: [
      {
        name: "Over the counter",
        who: "Bottle stores, liquor outlets, kiosks, tuckshops, supermarkets, bars, forecourts",
        copy: "There is no quote and no order. Somebody walks in, pays and walks out, and the whole sale is one action at the till. Which means every dollar you protect is protected in the second afterwards: the stock drops, the fiscal receipt prints, the cash is counted against what the shift should have taken.",
        steps: ["Ring it up", "Take cash, card or EcoCash", "Stock drops", "Fiscal receipt", "Close the shift"],
        icon: Storefront,
      },
      {
        name: "On account",
        who: "Hardware, spare parts, agro-dealers, wholesale, distribution",
        copy: "A customer asks for a price, and the quote comes off live stock and your real cost, so you know the margin before you send it. Then you pick, deliver, invoice from what actually left the yard, and chase the balance with a statement instead of a phone call.",
        steps: ["Quote", "Order", "Pick and deliver", "Invoice", "Collect"],
        icon: Warehouse,
      },
    ],
    landingPains: [
      "You hear about a stock-out from a customer who has already left.",
      "Nobody can tell you today's margin without a spreadsheet and an evening.",
      "Thursday's cash-up reaches you on Monday, when nothing can be done about it.",
    ],
    sectionIntros: {
      pains: {
        eyebrow: "What it costs you now",
        title: "Most shops lose more at the counter than they do on price.",
        copy: "A case here, a short till there, capital parked in stock nobody wants. None of it looks like theft on the day. Add it up over a year and it is usually bigger than the discount you argued over with your supplier.",
      },
      workflow: {
        eyebrow: "How a sale runs",
        title: "From the shelf to the bank, in one straight line.",
        copy: "Every step writes to the same record, so nothing gets typed twice and nothing quietly goes missing between the counter and the books.",
      },
      capabilities: {
        eyebrow: "What you actually get",
        title: "The four things that stop the leak.",
        copy: "Nothing exotic. Just the parts of a shop that have to agree with each other, finally agreeing with each other.",
      },
      outcomes: {
        eyebrow: "What changes",
        title: "What the first month should put back in your pocket.",
        copy: "Agreed with you before go-live and checked afterwards. One caught cash-up, one dead-stock order avoided, and the subscription has already paid for itself.",
      },
      commercials: {
        eyebrow: "What it costs",
        title: "The price is on the table before you spend an hour on a demo.",
        copy: `Priced per site, with every cashier and clerk included up to your seat ceiling. ${ANNUAL_PREPAY_COPY}. Onboarding is a published one-off fee, so you can see what you are buying.`,
      },
    },
    seo: {
      title: "POS, stock and wholesale software in Zimbabwe",
      description:
        "Know what you hold, what it cost and what it made. Corelith links till, stockroom and ledger for Zimbabwean shops, bottle stores and wholesalers.",
      path: "/home/solutions/sellers",
      keywords: [
        "POS system Zimbabwe",
        "bottle store software Zimbabwe",
        "liquor store POS Zimbabwe",
        "stock control software Zimbabwe",
        "wholesale software Zimbabwe",
        "spare parts shop software Zimbabwe",
        "ZIMRA fiscalisation POS",
        "shop cash-up software",
      ],
    },
    productVisual: {
      eyebrow: "Seller control view",
      title: "Stock, sales and branches in one operating view",
      status: "Running",
      metrics: [
        { label: "Today's sales", value: "$ 2,840.00", detail: "Across 3 branches" },
        { label: "Low-stock lines", value: "18", detail: "6 need ordering today" },
        { label: "Unpaid invoices", value: "$ 1,240.00", detail: "Due this week" },
      ],
      primaryRows: [
        { label: "Avondale branch", value: "$ 940.00", meta: "Cash-up ready" },
        { label: "Bulawayo branch", value: "$ 1,120.00", meta: "2 stock alerts" },
        { label: "Warehouse", value: "43 transfers", meta: "5 awaiting receipt" },
      ],
      secondaryRows: [
        { label: "Fiscal receipt queue", value: "Completed", tone: "success" },
        { label: "Brake pads reorder", value: "Needs input", tone: "warn" },
        { label: "Weekly margin report", value: "Running", tone: "neutral" },
      ],
    },
    pains: [
      "The drawer and the till report disagree, and nobody can say which cashier or which shift, so the loss just gets absorbed.",
      "Capital sits in lines that have not moved since March, while the fast seller you actually make money on is out of stock again.",
      "Deliveries, transfers and supplier notes get re-keyed by hand, and every re-key is a chance to lose a case of stock on paper.",
      "Comparing two branches means waiting for two spreadsheets from two people who are both busy.",
    ],
    capabilities: [
      {
        title: "Till, tender and cash-up",
        copy: "Fast entry, split payments across cash, card and EcoCash, returns and held carts, then a shift close that shows variance by till and by cashier before anybody goes home.",
        icon: ReceiptLong,
      },
      {
        title: "Stock that moves when the stock moves",
        copy: "Purchase orders, receiving, transfers between branches, counts and reorder points that fire on their own instead of waiting for someone to notice.",
        icon: Package,
      },
      {
        title: "Invoices, accounts and what you are owed",
        copy: "Quotes, invoices, part-payments, statements and an ageing list that tells you exactly who is sitting on your money and for how long.",
        icon: Wallet,
      },
      {
        title: "Branch by branch, side by side",
        copy: "Sales, stock cover, cash-up status and margin for every branch on one screen, without phoning anyone for a file.",
        icon: BarChart3,
      },
    ],
    outcomes: [
      "Short cash is traced to a shift and a person the same day, not written off at month end.",
      "Dead stock gets spotted while it is still worth something.",
      "Reordering runs off live cover, so you stop paying for panic buys.",
      "Fiscal receipts issue from the sale itself, and ZIMRA records are clean without a second exercise.",
    ],
    proofMetrics: [
      {
        value: `${formatUsd(startTier.annualMonthlyPrice)}/mo`,
        label: `Where one till and ${startTier.includedUsers} staff accounts start, paid annually`,
      },
      { value: "$0", label: "What adding another cashier costs, up to your seat ceiling" },
      { value: "Offline", label: "Keeps selling through load-shedding, syncs after" },
    ],
    modules: ["Core platform", "Sell", "Stock", "Books", "Retail pack"],
  },
  {
    slug: "service-providers",
    legacySlugs: [],
    pricingSlug: "service-providers",
    title: "Service providers",
    navTitle: "Service providers",
    who: "Cleaning, security, IT, logistics, plant hire, contractors, consultancies",
    eyebrow: "Cleaning, security, IT, logistics, plant hire, contractors",
    headline: "Bill every hour you worked, not every hour someone remembered.",
    summary:
      "Contracts, rosters and site visits become records that turn themselves into invoices at month end. The work your team did on Tuesday reaches the bill, instead of getting lost between the site and the office.",
    audience:
      "Cleaning and security companies, IT and facilities providers, transporters, plant hire yards, contractors and consultancies running recurring work across client sites.",
    cta: "See it running a contract",
    whatsapp:
      "Hi Corelith, I run a service business with staff on client sites. Where would this save me money?",
    icon: Work,
    deliverStep: {
      label: "Schedule and complete",
      copy: "Work is assigned to a person, a site and a date, and completion is captured on the phone that did the job, so there is a record before anyone has to remember.",
    },
    workflow: ["Enquiry", "Quote", "Contract", "Schedule work", "Confirm completion", "Invoice"],
    landingPains: [
      "Extra work gets done on site and never reaches a bill.",
      "Recurring invoices are rebuilt by hand every single month.",
      "A client disputes attendance and you have nothing to show them.",
    ],
    sectionIntros: {
      pains: {
        eyebrow: "What it costs you now",
        title: "The work is fine. The billing is where you lose.",
        copy: "Service businesses rarely fail on delivery. They fail on the small stuff nobody wrote down: an extra visit, an extra shift, a rate that moved. It is invisible per job and painful per year.",
      },
      workflow: {
        eyebrow: "How a month runs",
        title: "From signed contract to money in the bank.",
        copy: "The roster, the site confirmation and the invoice are the same record at three different points. Nobody rebuilds anything.",
      },
      capabilities: {
        eyebrow: "What you actually get",
        title: "Four things that turn work into revenue.",
        copy: "Built for a business where the people earning your money are standing on someone else's property.",
      },
      outcomes: {
        eyebrow: "What changes",
        title: "What the first month should recover.",
        copy: "Start with unbilled work. It is usually the first thing that pays for the subscription, and it is the number to watch hardest.",
      },
      commercials: {
        eyebrow: "What it costs",
        title: "You know the price before the proposal.",
        copy: `Priced per site with staff accounts included up to your ceiling, so putting every supervisor on it costs you nothing. ${ANNUAL_PREPAY_COPY} — annual is the ask.`,
      },
    },
    seo: {
      title: "Software for service businesses in Zimbabwe",
      description:
        "Bill every hour you worked. Corelith turns contracts, rosters and site visits into invoices for cleaning, security, IT, logistics and plant hire firms.",
      path: "/home/solutions/service-providers",
      keywords: [
        "service business software Zimbabwe",
        "contract management software Zimbabwe",
        "security company software Zimbabwe",
        "cleaning company software Zimbabwe",
        "field service software Zimbabwe",
        "recurring invoicing Zimbabwe",
        "timesheet software Zimbabwe",
      ],
    },
    productVisual: {
      eyebrow: "Service operations view",
      title: "Contracts, rosters and billing on one board",
      status: "Running",
      metrics: [
        { label: "Active contracts", value: "37", detail: "9 renew this quarter" },
        { label: "Visits this week", value: "184", detail: "12 unconfirmed" },
        { label: "Unbilled work", value: "$ 3,610.00", detail: "Ready to invoice" },
      ],
      primaryRows: [
        { label: "Msasa Park site", value: "18 visits", meta: "Confirmed by supervisor" },
        { label: "Borrowdale contract", value: "Renewal due", meta: "Quote drafted" },
        { label: "Callout — server room", value: "$ 180.00", meta: "Awaiting client sign-off" },
      ],
      secondaryRows: [
        { label: "Monthly billing run", value: "Running", tone: "neutral" },
        { label: "Two visits unconfirmed", value: "Needs input", tone: "warn" },
        { label: "Timesheets approved", value: "Completed", tone: "success" },
      ],
    },
    pains: [
      "A callout, an extra clean, an extra guard shift. The client got the value, the invoice went out light, and that gap repeats every month.",
      "The contract rate lives in a signed PDF, so billing depends on somebody remembering what was agreed two years ago.",
      "Rosters, timesheets and payroll are three separate exercises done on the same facts, and each one costs a day.",
      "Renewals arrive as a surprise, which is how a contract you have serviced for three years leaves at the old rate or leaves altogether.",
    ],
    capabilities: [
      {
        title: "Contracts and renewals",
        copy: "Client, sites, rate, scope and dates in one record, with renewals surfacing early enough to reprice them instead of losing them.",
        icon: FileText,
      },
      {
        title: "Scheduling and dispatch",
        copy: "Assign people and equipment to a site and a date, and confirm the job from a phone in the field. It works with no signal and syncs later.",
        icon: Calendar,
      },
      {
        title: "Time and attendance",
        copy: "Who was on site, how long for, approved by whom. That is the evidence behind the invoice and the evidence behind the payroll run.",
        icon: Users,
      },
      {
        title: "Recurring billing",
        copy: "A monthly run that reads the contract and the work actually done, raises the invoices and posts them into the books in one pass.",
        icon: ReceiptLong,
      },
    ],
    outcomes: [
      "Extra work reaches an invoice in the month it happened.",
      "Monthly billing takes an hour instead of most of a week.",
      "A disputed month is answered with a register, not an argument.",
      "Renewals get repriced before they lapse.",
    ],
    proofMetrics: [
      { value: "$0", label: "What adding a supervisor or a cleaner costs you" },
      { value: "Per site", label: "Priced by depots and offices, never by headcount" },
      { value: "Offline", label: "Site sign-off works where there is no signal" },
    ],
    modules: ["Core platform", "Sell", "Work", "Books", "People", "CRM pack"],
  },
  {
    slug: "workshops",
    legacySlugs: ["workshops-auto", "automotive"],
    pricingSlug: "workshops",
    title: "Workshops",
    navTitle: "Workshops",
    who: "Garages, panel beaters, fitment centres, equipment repair, dealer service bays",
    eyebrow: "Garages, panel beaters, fitment centres, equipment repair",
    headline: "Every part on the job card. Every hour on the invoice.",
    summary:
      "The job runs from estimate to approval to parts issue to invoice on one record, so labour and parts stop disappearing between the bay and the front desk. The bill is built from the work that was done, not from what somebody guessed at the end of it.",
    audience:
      "Service garages, panel beaters, fitment centres, plant and equipment repairers, dealership service bays and parts-and-service operators.",
    cta: "See it running a job card",
    whatsapp:
      "Hi Corelith, I run a workshop. I want to see what it does about parts and labour going missing.",
    icon: Wrench,
    deliverStep: {
      label: "Open the job card",
      copy: "Labour hours and issued parts book against the job while the work is happening, so the invoice writes itself and nothing has to be reconstructed later.",
    },
    workflow: ["Booking", "Estimate", "Approval", "Job card", "Parts and labour", "Invoice"],
    landingPains: [
      "Parts walk out of the store and never land on a job card.",
      "The customer approved a price on WhatsApp that nobody can find.",
      "You cannot say which jobs are stuck without walking the floor.",
    ],
    sectionIntros: {
      pains: {
        eyebrow: "What it costs you now",
        title: "The workshop is busy. The margin is thin. Those two facts are related.",
        copy: "Nothing dramatic goes wrong in a garage. A part here, half an hour there, one price argument you lost. It only shows up when you compare what the bay produced with what the bank received.",
      },
      workflow: {
        eyebrow: "How a job runs",
        title: "Booking to invoice, without anything falling off the card.",
        copy: "Six steps, one record. The estimate becomes the approval, the approval becomes the job, and the job becomes the bill.",
      },
      capabilities: {
        eyebrow: "What you actually get",
        title: "Four things that keep parts and hours on the bill.",
        copy: "Built around the job card, because in a workshop the job card is where the money either lands or disappears.",
      },
      outcomes: {
        eyebrow: "What changes",
        title: "What the first month should stop.",
        copy: "Parts leakage first. It is measurable, it is usually larger than owners expect, and it is the fastest thing to fix.",
      },
      commercials: {
        eyebrow: "What it costs",
        title: "Priced per workshop, not per technician.",
        copy: `Put every technician, storeman and service adviser on it up to your seat ceiling and pay nothing extra. ${ANNUAL_PREPAY_COPY}.`,
      },
    },
    seo: {
      title: "Workshop and garage job card software in Zimbabwe",
      description:
        "Every part on the job card, every hour on the invoice. Job cards, estimates, approvals, parts issue and costing for Zimbabwean workshops and garages.",
      path: "/home/solutions/workshops",
      keywords: [
        "workshop management software Zimbabwe",
        "garage job card software",
        "panel beater software Zimbabwe",
        "vehicle service software Zimbabwe",
        "fitment centre software",
        "parts and labour costing software",
        "service history software Zimbabwe",
      ],
    },
    productVisual: {
      eyebrow: "Workshop floor view",
      title: "Jobs, parts and approvals on one board",
      status: "Running",
      metrics: [
        { label: "Jobs in the bay", value: "9", detail: "3 awaiting approval" },
        { label: "Parts on jobs", value: "$ 740.00", detail: "Reserved, not yet billed" },
        { label: "Ready to invoice", value: "4", detail: "Work signed off" },
      ],
      primaryRows: [
        { label: "JC-1042 — Hilux service", value: "Needs input", meta: "Customer approval pending" },
        { label: "JC-1039 — Gearbox rebuild", value: "Running", meta: "Technician: T. Moyo" },
        { label: "Brake kit", value: "Completed", meta: "Issued to JC-1042" },
      ],
      secondaryRows: [
        { label: "Service history synced", value: "Completed", tone: "success" },
        { label: "Deposit outstanding", value: "Needs input", tone: "warn" },
        { label: "Bay allocation", value: "Running", tone: "neutral" },
      ],
    },
    pains: [
      "A part leaves the store on a promise, and by invoice time nobody remembers whose job it went to. You paid for it either way.",
      "Labour gets guessed at the front desk, and a guess is always rounded down, so every job comes out thinner than it should have.",
      "An approval sits in a chat, so when the customer argues about the bill you either produce nothing or you discount.",
      "Service history lives in a book, which means a customer who has spent three years with you gets treated like a stranger and priced like one.",
    ],
    capabilities: [
      {
        title: "Estimates and approvals",
        copy: "Quote the job, send it, capture the yes, and keep it attached to the record for good. A dispute becomes a document instead of a discount.",
        icon: ClipboardList,
      },
      {
        title: "Job cards",
        copy: "Booking, bay, technician, hours, status and sign-off on one card the whole workshop reads without walking anywhere.",
        icon: Wrench,
      },
      {
        title: "Parts issue and true cost",
        copy: "Parts stock, issued against a job or not issued at all, with purchasing for backorders and real cost sitting under every invoice line.",
        icon: Package,
      },
      {
        title: "Vehicle and machine history",
        copy: "Every unit keeps its own file: what was done, what was fitted, what it cost and what is due next. That last one brings people back.",
        icon: History,
      },
    ],
    outcomes: [
      "Parts are costed to a job or they do not leave the store.",
      "The approval exists before the spanner does.",
      "Invoices match the work, so margin per job stops being a mystery.",
      "Due services get chased, and repeat work stops depending on the customer remembering.",
    ],
    proofMetrics: [
      {
        value: productPriceLabel("workshops") ?? `${formatUsd(startTier.annualMonthlyPrice)}/mo`,
        label: "Where a single-bay workshop starts",
      },
      { value: "One job card", label: "Parts, hours, approval and invoice on the same record" },
      { value: "30 days", label: "Scoped setup from workflow mapping to go-live" },
    ],
    modules: ["Core platform", "Sell", "Stock", "Work", "Books", "Workshop pack"],
  },
  {
    slug: "manufacturers",
    legacySlugs: [],
    pricingSlug: "manufacturers",
    title: "Manufacturers",
    navTitle: "Manufacturers",
    who: "Food and beverage, fabrication, packaging, furniture, chemicals, assembly",
    eyebrow: "Food and beverage, fabrication, packaging, furniture, assembly",
    headline: "Know what a unit costs you before you agree a price.",
    summary:
      "Raw material goes into a run, output and wastage come out of it, and the true cost lands on the finished goods it produced. So you quote from a number instead of a feeling, and you find out about a bad run while it is still running.",
    audience:
      "Food and beverage processors, fabricators, packaging and printing works, furniture makers, chemical blenders and light assembly operations.",
    cta: "See it running a batch",
    whatsapp:
      "Hi Corelith, I run a production business. I want to see how you get to a real cost per unit.",
    icon: Factory,
    deliverStep: {
      label: "Make the batch",
      copy: "Materials are issued against the run, output and wastage are booked as they happen, and the cost of the run settles onto the goods it produced.",
    },
    workflow: ["Order", "Plan the run", "Issue materials", "Produce", "Book output", "Dispatch and invoice"],
    landingPains: [
      "Unit cost is a guess, so every price you quote is a gamble on your own margin.",
      "Yield and wastage only appear at stock-take, months too late.",
      "Machine downtime gets discussed and never actually recorded.",
    ],
    sectionIntros: {
      pains: {
        eyebrow: "What it costs you now",
        title: "You cannot price properly if you cannot cost properly.",
        copy: "Most production businesses here are not short of orders. They are short of a defensible cost per unit, which means they win the wrong jobs at the wrong price and only discover it much later.",
      },
      workflow: {
        eyebrow: "How a run works",
        title: "Raw material in, finished goods out, cost attached to both.",
        copy: "The run is the record. What goes in, what comes out, what was lost, and what the whole thing cost you.",
      },
      capabilities: {
        eyebrow: "What you actually get",
        title: "Four things that turn production into numbers.",
        copy: "Enough to cost a batch properly without a consultant and without a plant-wide project.",
      },
      outcomes: {
        eyebrow: "What changes",
        title: "What the first quarter should settle.",
        copy: "Yield and wastage stop being an argument at month end and start being something you watch daily, while there is still time to act.",
      },
      commercials: {
        eyebrow: "What it costs",
        title: "Priced by plant and store, not by how many people work there.",
        copy: `Every operator, storeman and supervisor is included up to your seat ceiling. ${ANNUAL_PREPAY_COPY}. Onboarding is a published one-off, scoped against your actual lines.`,
      },
    },
    seo: {
      title: "Manufacturing and production software in Zimbabwe",
      description:
        "Know what a unit costs before you quote it. Corelith tracks materials, runs, yield, wastage and unit cost for Zimbabwean manufacturers and processors.",
      path: "/home/solutions/manufacturers",
      keywords: [
        "manufacturing software Zimbabwe",
        "production management software Zimbabwe",
        "unit cost software Zimbabwe",
        "food processing software Zimbabwe",
        "raw material tracking software",
        "yield and wastage tracking",
        "plant maintenance software Zimbabwe",
      ],
    },
    productVisual: {
      eyebrow: "Production view",
      title: "Runs, materials and yield in one place",
      status: "Running",
      metrics: [
        { label: "Runs in progress", value: "4", detail: "2 finish today" },
        { label: "Yield this week", value: "94.2%", detail: "Target 93%" },
        { label: "Finished goods", value: "$ 18,400.00", detail: "Valued at cost" },
      ],
      primaryRows: [
        { label: "Batch RUN-0318", value: "Running", meta: "1,200 units, line 2" },
        { label: "Maize meal — 10kg", value: "Completed", meta: "Yield 95.1%" },
        { label: "Packaging film", value: "Needs input", meta: "Below reorder point" },
      ],
      secondaryRows: [
        { label: "Line 2 service due", value: "Needs input", tone: "warn" },
        { label: "Material issue posted", value: "Completed", tone: "success" },
        { label: "Dispatch schedule", value: "Running", tone: "neutral" },
      ],
    },
    pains: [
      "You agree a price that feels about right, and find out at stock-take whether the run made money. That is a bet settled three months late.",
      "Material issues are written on paper and reconciled long after the run, so a bad yield is a rumour rather than a number.",
      "Wastage is normal until somebody measures it, and by the time anyone does, a season of it is already gone.",
      "A line goes down and the cost of it is never attached to the output it took away, so maintenance keeps losing the argument for budget.",
    ],
    capabilities: [
      {
        title: "Materials and receiving",
        copy: "Raw material stock across every store, with suppliers, purchase orders, receiving and reorder points that warn you before the line stops.",
        icon: Warehouse,
      },
      {
        title: "Production runs",
        copy: "Plan a run, issue against it, book output and wastage as they happen, then close it with a cost you can defend.",
        icon: Factory,
      },
      {
        title: "Cost and yield",
        copy: "Cost per unit, yield per run and wastage by line. These are the numbers that decide whether an order is worth taking at all.",
        icon: ChartLine,
      },
      {
        title: "Plant and maintenance",
        copy: "Equipment register, planned maintenance and breakdowns tied to the production they interrupted, so downtime finally has a price on it.",
        icon: Wrench,
      },
    ],
    outcomes: [
      "You quote from a costed unit, and low-margin orders get refused instead of won.",
      "Wastage is caught during the run, while it can still be corrected.",
      "Raw material cover is visible before a stock-out idles a shift.",
      "Downtime carries a number, so maintenance spend gets decided on evidence.",
    ],
    proofMetrics: [
      { value: "Per run", label: "Materials in, output and wastage out, costed" },
      {
        value: `${formatUsd(scaleTier.annualMonthlyPrice)}/mo`,
        label: `${scaleTier.includedSites} sites and ${scaleTier.includedUsers} staff accounts on ${scaleTier.name}, paid annually`,
      },
      { value: "30 days", label: "From workflow mapping to your first costed run" },
    ],
    modules: ["Core platform", "Stock", "Work", "Books", "Maintenance pack"],
  },
  {
    slug: "sales-teams",
    legacySlugs: [],
    pricingSlug: "sales-teams",
    title: "Sales teams",
    navTitle: "Sales teams",
    who: "Field sales, distributor reps, B2B account teams, dealership floors",
    eyebrow: "Field sales, distributor reps, account teams, dealership floors",
    headline: "Quotes off real stock. Follow-ups that happen. Commission nobody argues about.",
    summary:
      "Leads, quotes and follow-ups sit on the same rail as stock and invoicing, so a won deal becomes an order without anyone re-typing it. Reps stop promising goods you have already sold, and quiet deals stop being free money for your competitor.",
    audience:
      "Field sales teams, distributor and agency reps, B2B account managers, dealership floors and any team carrying a target against real stock.",
    cta: "See it running a pipeline",
    whatsapp:
      "Hi Corelith, I run a sales team. Show me how quotes, follow-ups and commission work.",
    icon: Megaphone,
    deliverStep: {
      label: "Win and hand over",
      copy: "The won deal turns into an order with the stock already reserved against it, so nothing is re-keyed and nothing gets promised to two customers.",
    },
    workflow: ["Lead", "Qualify", "Quote", "Follow up", "Close", "Hand to fulfilment"],
    landingPains: [
      "The pipeline is a spreadsheet that is honest once a month.",
      "Reps quote stock that someone else sold yesterday.",
      "Commission gets argued over instead of calculated.",
    ],
    sectionIntros: {
      pains: {
        eyebrow: "What it costs you now",
        title: "The deals you lose quietly cost more than the ones you lose loudly.",
        copy: "A rejected quote at least tells you something. A quote nobody followed up just disappears, and it was revenue you already had in your hand.",
      },
      workflow: {
        eyebrow: "How a deal runs",
        title: "Lead to cash, without a handover that loses things.",
        copy: "The quote, the order and the invoice are the same document at three points in its life. Fulfilment reads what the rep wrote, not a retyped version of it.",
      },
      capabilities: {
        eyebrow: "What you actually get",
        title: "Four things that make reps update it without being chased.",
        copy: "Because a pipeline only stays honest when the rep gets something out of keeping it honest.",
      },
      outcomes: {
        eyebrow: "What changes",
        title: "What the first quarter should recover.",
        copy: "Start with deals that went quiet. They are the cheapest revenue in the business, and they are already yours.",
      },
      commercials: {
        eyebrow: "What it costs",
        title: "Priced per site, so growing the team does not grow the bill.",
        copy: `Add every rep up to your seat ceiling for nothing. ${ANNUAL_PREPAY_COPY}. Onboarding is a published one-off, agreed before you commit.`,
      },
    },
    seo: {
      title: "Sales team CRM and quoting software in Zimbabwe",
      description:
        "Quote off live stock, chase every deal and pay commission from paid invoices. Corelith runs pipeline and quoting for Zimbabwean sales teams.",
      path: "/home/solutions/sales-teams",
      keywords: [
        "sales CRM Zimbabwe",
        "pipeline software Zimbabwe",
        "quotation software Zimbabwe",
        "field sales app Zimbabwe",
        "commission tracking software",
        "distributor rep software Zimbabwe",
        "B2B sales software Zimbabwe",
      ],
    },
    productVisual: {
      eyebrow: "Sales view",
      title: "Pipeline, quotes and follow-ups by rep",
      status: "Running",
      metrics: [
        { label: "Open pipeline", value: "$ 46,200.00", detail: "31 live deals" },
        { label: "Quotes out", value: "18", detail: "6 expire this week" },
        { label: "Closed this month", value: "$ 12,900.00", detail: "72% of target" },
      ],
      primaryRows: [
        { label: "Chikwanha Hardware", value: "$ 8,400.00", meta: "Quote sent, follow up Friday" },
        { label: "Ruwa Distributors", value: "Won", meta: "Converted to order SO-2210" },
        { label: "T. Moyo — Q3 target", value: "72%", meta: "Ahead of pace" },
      ],
      secondaryRows: [
        { label: "6 follow-ups due today", value: "Needs input", tone: "warn" },
        { label: "Commission run", value: "Running", tone: "neutral" },
        { label: "Quote-to-order sync", value: "Completed", tone: "success" },
      ],
    },
    pains: [
      "Leads live in personal phones, so when a rep resigns the pipeline resigns with them and walks to a competitor.",
      "A quote goes out against stock already committed elsewhere, and you either disappoint the customer or buy in at a loss to save face.",
      "Follow-ups depend on memory, and the ones that slip are always the big ones, because big deals take longer.",
      "Targets and commission are rebuilt from scratch every month end, disputed every month end, and paid on invoices that were never collected.",
    ],
    capabilities: [
      {
        title: "Leads and pipeline",
        copy: "Every enquiry with an owner, a value, a stage and a next action that carries a date. It belongs to the business, not to a phone.",
        icon: TrendingUp,
      },
      {
        title: "Quotes off live stock",
        copy: "Price from real availability and real cost, send the document, and turn the accepted quote into an order without retyping a line.",
        icon: FileText,
      },
      {
        title: "Follow-up that does not slip",
        copy: "Reminders, call logs and ageing deals surfaced every morning, so quiet deals get chased while they are still worth chasing.",
        icon: Calendar,
      },
      {
        title: "Targets and commission",
        copy: "Target per rep, live attainment, and commission worked out from invoices that were actually paid. Calculated once, disputed never.",
        icon: Payments,
      },
    ],
    outcomes: [
      "The pipeline survives a resignation.",
      "Quotes never oversell stock, so you stop paying to fix promises.",
      "Deals get chased on the day they are due, not the week after they died.",
      "Commission is paid off collected cash, which protects margin and ends the monthly argument.",
    ],
    proofMetrics: [
      { value: "$0", label: "What adding a rep costs, up to your seat ceiling" },
      { value: "Live stock", label: "Behind every quote a rep sends" },
      { value: "On a phone", label: "Built for people who are not at a desk" },
    ],
    modules: ["Core platform", "Sell", "Stock", "Books", "CRM pack"],
  },
];

export const primarySegment = segments[0];

/** Kept as an alias so existing imports and the sitemap keep resolving. */
export const solutions = segments;
export type MarketingSolution = MarketingSegment;

export function getSegmentBySlug(slug: string) {
  return segments.find((segment) => segment.slug === slug) ?? null;
}

export function getSegmentByAnySlug(slug: string) {
  return (
    segments.find(
      (segment) => segment.slug === slug || segment.legacySlugs.includes(slug),
    ) ?? null
  );
}

export function getCanonicalSegmentSlug(slug: string) {
  return getSegmentByAnySlug(slug)?.slug ?? null;
}

export const getSolutionBySlug = getSegmentBySlug;
export const getSolutionByAnySlug = getSegmentByAnySlug;
export const getCanonicalSolutionSlug = getCanonicalSegmentSlug;

// ---------------------------------------------------------------------------
// Schools — a separate track, not a segment
// ---------------------------------------------------------------------------

/**
 * Schools sit outside `segments` on purpose. They do not run order-to-cash,
 * they buy per term against enrolment, and the decision goes through a board
 * rather than an owner. Mixing them into the main funnel weakens both stories.
 */
export const schoolsTrack = {
  eyebrow: "Corelith for schools",
  headline: "Collect the fees you are owed. Keep one record of every child.",
  summary:
    "Admissions, fees, academics, boarding and parents run off one student record instead of four departmental copies. Arrears become a list the bursar works daily rather than a shock at the end of term, and the head walks into a board meeting with the numbers already agreed.",
  audience:
    "Private and mission schools, boarding schools, colleges and multi-campus groups, where the head, the bursar and the board all need the same figures to say the same thing.",
  cta: "Arrange a school consultation",
  secondaryCta: "WhatsApp us",
  whatsapp:
    "Hi Corelith, I am from a school and would like to talk about Corelith Schools.",
  icon: Building2,
  assurances: [
    // Schools stay on per-term enrolment bands; PR-4.2 reconciles them with the
    // monthly tier ladder.
    `From ${formatUsd(SCHOOL_STARTING_TERM_PRICE)} per campus, per term`,
    "Unlimited staff and teacher accounts",
    "Your records migrated before you open",
  ],
  workflow: ["Application", "Admission", "Fee schedule", "Payment", "Academics", "Parent portal"],
  sectionIntros: {
    why: {
      eyebrow: "Why schools are different",
      title: "A school does not run on invoices and stock. It runs on a term.",
      copy: "The money arrives three times a year. The decision goes through a board, not an owner. The records you keep answer to the ministry. So a system sold as a monthly subscription against an order book was never built for you.",
    },
    year: {
      eyebrow: "The school year",
      title: "Admitted once, read by everybody.",
      copy: "The registrar admits a child, and from that moment the bursar, the class teacher and the parent are all reading the same record rather than keeping their own copy of it.",
    },
    included: {
      eyebrow: "What is included",
      title: "Everything the school office does, on one system.",
      copy: "Admissions through to report cards, with the finance side connected rather than bolted on afterwards by someone with a spreadsheet.",
    },
    pricing: {
      eyebrow: "Schools pricing",
      title: "Per campus, per term, set by enrolment.",
      copy: "Three terms a year, so each band covers roughly four months. Bands are flat, so growing inside yours never costs more, and every band carries unlimited staff and teacher accounts.",
    },
    addOns: {
      eyebrow: "School add-ons",
      title: "Transport, fiscalisation, branding and migration.",
      copy: "Priced per term alongside your band. Data migration is the exception: one charge at the start of the rollout and nothing after it.",
    },
    outcomes: {
      eyebrow: "What should change",
      title: "What the first term is supposed to fix.",
      copy: "Agreed with the head and the bursar before the rollout starts, then reviewed together at the end of the term. If collections have not moved, we will say so.",
    },
    faq: {
      eyebrow: "From school leadership",
      title: "The questions a board asks before it approves anything.",
      copy: "Written for the meeting where somebody asks what this costs, what happens to our records, and what we do if it does not work.",
    },
  },
  pains: [
    "Fees are owed, but nobody can produce today's arrears figure without three departments and half a day, so chasing starts far too late in the term.",
    "Admissions, student records, fees and academics live in four different files, and when they disagree the school defends the wrong number to a parent.",
    "Parents ring the bursar for a balance that should be on their own screen, and the office loses hours a week to it.",
    "The head walks into a board meeting with finance, attendance and results from three sources that were never reconciled with each other.",
  ],
  capabilities: [
    {
      title: "Admissions and student records",
      copy: "Applications, offers, enrolment, guardians, classes, documents and the full student file in one place, so a child is captured once and never re-typed.",
      icon: ClipboardList,
    },
    {
      title: "Fees and finance",
      copy: "Fee structures, bulk invoicing, receipts, waivers, statements and an arrears list the bursar can work through daily instead of discovering at term end.",
      icon: Payments,
    },
    {
      title: "Academics",
      copy: "Attendance registers, subjects, teachers, marks entry, moderation windows and report cards that publish without a fortnight of collation.",
      icon: FileText,
    },
    {
      title: "Boarding and welfare",
      copy: "Hostels, beds, leave, sanatorium and the day-to-day records a boarding school is expected to be able to produce on request.",
      icon: Building2,
    },
    {
      title: "Parent and teacher portals",
      copy: "Parents check balances, statements and results on their own phone. That is a phone call the bursar's office does not have to take.",
      icon: Users,
    },
    {
      title: "Reporting for the board",
      copy: "Enrolment, collections, arrears, attendance and results in the shape a board actually asks for, ready before the meeting rather than during it.",
      icon: BarChart3,
    },
  ],
  outcomes: [
    "Arrears are visible from week one of term, so collection starts while parents still have the money.",
    "One student record replaces four departmental copies, and the school stops defending figures it cannot back.",
    "Parents self-serve balances, statements and results, which takes a day a week off the bursar's office.",
    "Term-end reporting is a page the head opens, not a fortnight of collation before a board meeting.",
  ],
  faqs: [
    {
      q: "Why are you priced per term instead of per month?",
      a: "Because that is how a school's money arrives. Fees come in three times a year, so a monthly debit hits an account that is empty for large parts of it. A term price sits inside the same budget line the board already approves, and there are three of them a year.",
    },
    {
      q: "What happens to the records we already have?",
      a: "They come with you. Data migration is a scoped, one-off item at $199: students, guardians, classes, fee structures and outstanding balances are imported so you open the new term with correct opening figures rather than a blank system and a backlog.",
    },
    {
      q: "Our internet is unreliable and the power goes. Will registers and receipts still work?",
      a: "Yes. Attendance capture and fee receipting keep working with no connection and sync once it returns. A school day should not stop because the line does.",
    },
    {
      q: "Do parents have to install an application?",
      a: "No. The parent portal opens in a browser on any phone. Balances, statements and results are there without anybody ringing the bursar, which is where most of the office's lost time goes.",
    },
    {
      q: "We are a group with several campuses. Does each one keep its own registers?",
      a: "Yes. Every campus keeps its own registers, fee structure and staff, while the group consolidates into one set of books and one reporting line. The Group band is quoted, and the per-student rate stays below the Premier band so growing never costs you more per head.",
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// Platform modules
// ---------------------------------------------------------------------------

export const coreModules = [
  {
    name: "Sell",
    icon: ReceiptLong,
    copy:
      "Leads, quotes, orders, point of sale, invoices, receipts, customer accounts and statements.",
    connection:
      "A sale writes to the customer, drops the stock, books the margin and posts to the ledger in one action, so your day's takings and your day's margin are the same number.",
    highlights: ["Quotes and orders", "Point of sale", "Invoices and receipts", "Customer statements"],
  },
  {
    name: "Stock",
    icon: Package,
    copy:
      "Products, suppliers, purchase orders, receiving, warehouses, transfers, counts and reorder points.",
    connection:
      "Receiving updates what you hold, what it cost you and what needs ordering, so buying decisions come off live cover instead of memory.",
    highlights: ["Multi-store inventory", "Purchase orders", "Transfers and counts", "Reorder alerts"],
  },
  {
    name: "Work",
    icon: Wrench,
    copy:
      "Job cards, production runs, service visits, equipment, maintenance and completion sign-off.",
    connection:
      "Whatever you deliver consumes parts and hours against one costed record, so the invoice is built from the work rather than from a guess.",
    highlights: ["Job cards", "Production runs", "Scheduling", "Maintenance"],
  },
  {
    name: "Books",
    icon: FileText,
    copy:
      "Cash and bank, receivables, payables, expenses, VAT, fixed assets, multi-currency and financial statements.",
    connection:
      "Sales and purchases post themselves, so the trial balance is a page you open rather than a year your accountant rebuilds.",
    highlights: ["Receivables and payables", "Banking", "VAT and fiscalisation", "Financial statements"],
  },
  {
    name: "People",
    icon: Users,
    copy:
      "Staff records, roles and permissions, attendance, approvals, payroll and per-user accountability.",
    connection:
      "Every record carries who created, approved or changed it, so control does not rest on one trusted person staying honest and staying employed.",
    highlights: ["Roles and permissions", "Attendance", "Approvals", "Payroll"],
  },
];

export const platformCapabilities = [
  {
    title: "It works when the power does not",
    copy: "Sales, stock moves and attendance keep going through load-shedding and dead links, then sync the moment the connection returns. A closed till is lost revenue you never get back.",
    icon: WifiOff,
  },
  {
    title: "Built for a phone",
    copy: "The people earning your money are in a yard, a bay or on a client site. Every daily screen is built for the device they are actually holding.",
    icon: Storefront,
  },
  {
    title: "ZIMRA fiscalisation",
    copy: "Fiscal receipts and the FDMS link are part of the product. Not a third-party connector you pay for, maintain and get blamed for when it breaks.",
    icon: ShieldCheck,
  },
  {
    title: "Many sites, two currencies",
    copy: "Branches, warehouses and campuses roll into one set of books in USD and ZWG, without a month-end consolidation exercise done by hand.",
    icon: ArrowRightLeft,
  },
  {
    title: "Roles that actually hold",
    copy: "Approval limits, permission sets and an audit trail on every record. Discounts, write-offs and stock adjustments stop being anonymous.",
    icon: ShieldCheck,
  },
  {
    title: "Answers, not report requests",
    copy: "Margin, ageing, stock cover, yield and branch performance are pages you open. Nobody spends a weekend building them.",
    icon: BarChart3,
  },
];

export const launchSprintSteps = [
  {
    title: "Map how you run today",
    copy: "We walk through how orders, stock, jobs, invoices, payments and approvals actually move through your business, including the bits that only happen because one person remembers to do them.",
    icon: ClipboardList,
  },
  {
    title: "Configure it around that map",
    copy: "The core platform, your industry pack, your sites, your roles and your approval limits are set up to match what we found, not a generic template.",
    icon: Dashboard,
  },
  {
    title: "Bring your data across",
    copy: "Products, customers, suppliers, opening balances and opening stock loaded within an agreed scope, so day one starts from your real position.",
    icon: ArrowRightLeft,
  },
  {
    title: "Train the people doing the work",
    copy: "Cashiers, storemen, technicians, supervisors and whoever reads the reports get trained on your own data. Training on a demo account is how adoption dies.",
    icon: Users,
  },
  {
    title: "Go live with us on the line",
    copy: "First invoices, first receipts, first job cards, first close of shift, with someone reachable while it is happening rather than the next working day.",
    icon: CheckCircle,
  },
  {
    title: "Follow up and check it stuck",
    copy: "WhatsApp follow-up through the first month, an adoption check, and a review of the first month's numbers against the targets we agreed at the start.",
    icon: LifeBuoy,
  },
];

/** What has to be true before a rollout counts as finished. */
export const launchSprintDone = [
  "Products, customers, suppliers and opening balances loaded within the scope we agreed",
  "Roles, permissions and approval limits set for the people actually doing the work",
  "Real invoices, receipts, stock movements and job cards created on live data",
  "The first weekly operating report opened and understood by the owner",
  "A named channel for questions, agreed before anybody needs it",
  "The next module identified only when there is a number saying it will pay for itself",
];

/** What the onboarding fee buys, shown on the pricing page. */
export const onboardingCovers = [
  "Mapping how orders, stock, jobs, invoices and approvals actually move through your business today",
  "Configuring the platform, your industry pack, your sites and who is allowed to do what",
  "Importing products, customers, suppliers, opening balances and opening stock",
  "Training the people who will use it every day, on your own data",
  "Standing with you through your first live day, first invoices and first cash-up",
  "WhatsApp follow-up through the first month, then a review of the numbers against what we agreed",
];

/** A first rollout that pays for itself before it grows. */
export const firstRollout = [
  "The core platform, your sites, your people and what each of them is allowed to do",
  "The one industry pack that matches how you deliver",
  "Stock or job cards, whichever is bleeding hardest right now",
  "Invoicing and receipts, fiscalised where ZIMRA requires it",
  "The two or three reports you will open on a Monday morning",
];

export const pricingPrinciples = [
  "The plan covers sites and capacity. It never counts heads.",
  "Add every cashier, clerk, rep and technician you need up to your seat ceiling, at no extra cost.",
  "Extra seats come in packs of five. Extra sites bill at your plan's per-site rate.",
  `Annual is the price we quote, and it is ${ANNUAL_DISCOUNT_LABEL}. Month to month is there if you want it.`,
  `Onboarding is a published one-off fee — nothing on ${fiscalTier.name} or ${startTier.name} — because migration and training are real work by real people.`,
  "Start with the one pack fixing this month's problem. Add depth when it pays for itself.",
];

export const proofFrames = [
  {
    title: "Work that reaches a bill",
    metric: "Nothing unbilled",
    copy: "Jobs completed, parts issued and stock delivered that never made it onto an invoice. This is usually where the money comes back first, and it is the number we ask you to watch hardest.",
    icon: Coins,
  },
  {
    title: "What the shelf says against what you say",
    metric: "System matches shelf",
    copy: "The gap between what the system thinks you hold and what a physical count actually finds. We measure it before go-live so the number afterwards means something.",
    icon: PackageCheck,
  },
  {
    title: "Time to a straight answer",
    metric: "Days to minutes",
    copy: "How long it takes you to answer what you made this week. If that is still a spreadsheet exercise a month after go-live, the rollout did not work and we will say so.",
    icon: BarChart3,
  },
];

export const launchTargets = [
  { value: "Harare first", label: "The largest concentration of operating businesses" },
  { value: "Bulawayo next", label: "Strong trade base and a higher formal share" },
  { value: "10 founding customers", label: "Across selling, service, workshop and production" },
];

export const contactChannels = [
  {
    title: "WhatsApp",
    value: WHATSAPP_DISPLAY,
    icon: ClipboardList,
    copy: "Fastest answer on price, fit and whether this would actually help your business.",
    href: whatsappHref("Hi Corelith, I would like help finding the right setup."),
    external: true,
  },
  {
    title: "Email",
    value: "hello@pagka.dev",
    icon: Mail,
    copy: "Best for proposals, procurement, school committees and anything that needs to be forwarded.",
    href: "mailto:hello@pagka.dev",
    external: false,
  },
  {
    title: "Set up a demo properly",
    value: "A few setup questions",
    icon: Calendar,
    copy: "Answer them first and the demo opens on your workflow and your numbers instead of an empty account.",
    href: "/home/book-demo",
    external: false,
  },
];

/** What makes a first reply worth reading. */
export const contactChecklist = [
  "What you sell or deliver, and what city you are in",
  "How many sites, branches or yards you run",
  "How many people would be using it",
  "What you use today, including the books and the spreadsheets",
  "Where you think money is going missing",
  "When you would want it running",
];

export const foundingPartnerItems = [
  "Selected businesses only, across selling, service, workshop and production",
  "Discounted, scoped onboarding",
  "Your rate held for the first twelve months",
  "Workflow mapping done directly with the people who build the product",
  "Data migration within a defined scope",
  "Feedback sessions that change the roadmap, not a suggestion box",
  "Success targets agreed in writing before go-live",
  "Case-study participation only after results, and only if you say yes",
];

/** What we ask of a founding partner. Stated plainly, because it is a trade. */
export const foundingPartnerQuestions = [
  "Can you name the leak, and roughly what it is costing you a month?",
  "Is there someone senior enough inside the business to own the rollout and make people use it?",
  "Will you tell us plainly when something does not work, instead of quietly going back to the notebook?",
];

/**
 * The plan ladder written out for the FAQ, annual first. Derived so the answer
 * cannot drift from the catalog the invoice is cut from.
 */
const tierLadderCopy = MARKETING_TIERS.map((tier) => {
  const sites =
    tier.includedSites >= 100
      ? "unlimited sites"
      : `${tier.includedSites} ${tier.includedSites === 1 ? "site" : "sites"}`;
  const users = tier.includedUsers === null ? "unlimited users" : `${tier.includedUsers} users`;
  return `${tier.name} ${tier.isQuoted ? "from" : "at"} ${formatUsd(tier.annualMonthlyPrice)} (${sites}, ${users})`;
}).join(", ");

const onboardingLadderCopy = MARKETING_TIERS.map((tier) =>
  tier.isQuoted
    ? `${tier.name} scoped with you`
    : `${tier.name} ${tier.onboardingFee > 0 ? formatUsd(tier.onboardingFee) : "nothing"}`,
).join(", ");

export const faqs = [
  {
    q: "I already have a POS. Why would I change?",
    a: "You may not need to replace the till so much as connect it. A POS takes the money and tells nobody, so purchasing, costing and the books all find out later. Corelith runs the sale and everything the sale causes in one place, so the drawer, the shelf and the ledger agree by the end of the shift.",
  },
  {
    q: "I run a bottle store. I do not invoice anyone.",
    a: "Then you skip the quote, the order and the invoice, and you keep the part that protects your cash. Stock drops as it sells, the fiscal receipt comes off the same action, and the shift cash-up shows variance by till and by cashier before anybody goes home.",
  },
  {
    q: "What does this cost, and do you charge per user?",
    a: `Paid annually, which is what we quote: ${tierLadderCopy}. Month to month costs the full rate, so paying for the year is ${ANNUAL_DISCOUNT_LABEL}. There is no per-user charge until you pass your seat ceiling, so adding a cashier or a technician costs nothing. Onboarding is a published one-off: ${onboardingLadderCopy}.`,
  },
  {
    q: "My staff will not use it.",
    a: "That is a fair worry, and it is usually a training and workflow problem rather than a software one. The daily screens are built for a phone in a yard or a bay, training happens on your own data during the Launch Sprint, and we check adoption during the first month instead of leaving you to it. If your team is still on the notebook after go-live, we have not finished the job.",
  },
  {
    q: "Does it work when the internet is down?",
    a: "Yes. Sales, stock movements and attendance keep working offline and sync as soon as the connection returns. Load-shedding stops the lights, not the shop.",
  },
  {
    q: "Do you handle ZIMRA fiscalisation?",
    a: "Yes, the FDMS integration is part of the product. The fiscal receipt is issued from the same sale that drops your stock and posts to your books, so there is no separate step for anyone to forget.",
  },
  {
    q: "Can you move our existing records across?",
    a: "Yes. Products, customers, suppliers, opening stock and opening balances are loaded during the Launch Sprint within a scope we agree with you first, so you open on correct figures rather than starting the year twice.",
  },
  {
    q: "Is my data safe?",
    a: "Your business runs in its own workspace. Roles and permission limits decide who can see or change what, and every record carries who created, approved or changed it. You can export everything at any time, and it stays yours.",
  },
  {
    q: "What happens if I stop paying?",
    a: "Your data stays yours and exports at any time. Cancel within the first 30 days and you get your money back. After that, access runs to the end of the period you have paid for, and you take an export of your records with you.",
  },
  {
    q: "Can I try it before I commit?",
    a: "A blank account tells you very little about software like this, because the value only shows up once your own stock, customers and prices are in it. What works is a demo running your own workflow, then a scoped Launch Sprint with targets agreed in writing, backed by the 30-day money-back guarantee.",
  },
];

export const setupQuestions = [
  "Business name",
  "Contact person",
  "Work email",
  "Phone",
  "City",
  "Business type",
  "Locations",
  "People using the system",
  "Current tools",
  "Where the money seems to go",
  "Timeline",
  "Preferred channel",
];

export const companyPrinciples = [
  {
    title: "Nobody buys software. They buy the money back.",
    copy:
      "A subscription is only worth paying if it returns more than it costs. One caught cash-up, one dead-stock order avoided, one job that finally got billed. That is the bar, and it is the number to hold us to.",
    icon: Coins,
  },
  {
    title: "Getting it live is the hard part",
    copy:
      "The job is not done when a login exists. It is done when your storeman uses it on a Tuesday without being reminded. Which is why rollout is scoped, priced and owned rather than left to hope.",
    icon: LifeBuoy,
  },
  {
    title: "Fix one thing first",
    copy:
      "Turn on the part costing you money this month and leave the rest alone. Businesses that switch on everything at once usually switch it all off again by March.",
    icon: TrendingUp,
  },
  {
    title: "Built here, answered here",
    copy:
      "The people who wrote it are in Harare and reachable on the same WhatsApp number your customers use. No time zone, no ticket queue, no partner in another country who has never seen a bottle store.",
    icon: Building2,
  },
];
