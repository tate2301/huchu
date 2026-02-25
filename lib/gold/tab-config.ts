import {
  type LucideIcon,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Coins,
  Gem,
  PackageCheck,
  Payments,
  Scale,
  Wallet,
} from "@/lib/icons";

export type GoldTab =
  | "home"
  | "batches"
  | "purchases"
  | "dispatches"
  | "sales"
  | "prices"
  | "payouts"
  | "issues"
  | "reports";

export type GoldTabItem = {
  id: GoldTab;
  label: string;
  href: string;
  icon: LucideIcon;
  featureKey: string;
};

export const GOLD_TABS: GoldTabItem[] = [
  {
    id: "home",
    label: "Home",
    href: "/gold",
    icon: Gem,
    featureKey: "gold.home",
  },
  {
    id: "batches",
    label: "Batches",
    href: "/gold/intake/pours",
    icon: PackageCheck,
    featureKey: "gold.intake.pours",
  },
  {
    id: "purchases",
    label: "Purchases",
    href: "/gold/intake/purchases",
    icon: Payments,
    featureKey: "gold.intake.pours",
  },
  {
    id: "dispatches",
    label: "Dispatches",
    href: "/gold/transit/dispatches",
    icon: ArrowRightLeft,
    featureKey: "gold.dispatches",
  },
  {
    id: "sales",
    label: "Sales",
    href: "/gold/settlement/receipts",
    icon: Scale,
    featureKey: "gold.receipts",
  },
  {
    id: "prices",
    label: "Pricing",
    href: "/gold/prices",
    icon: Coins,
    featureKey: "gold.home",
  },
  {
    id: "payouts",
    label: "Payouts",
    href: "/gold/settlement/payouts",
    icon: Wallet,
    featureKey: "gold.payouts",
  },
  {
    id: "issues",
    label: "Issues",
    href: "/gold/exceptions",
    icon: AlertTriangle,
    featureKey: "gold.exceptions",
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports/gold-chain",
    icon: BarChart3,
    featureKey: "reports.gold-chain",
  },
];
