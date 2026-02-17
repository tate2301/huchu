"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { ExecutiveQuickLink } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowDownward,
  ArrowRight,
  ArrowUpward,
  BarChart3,
  Coins,
  Dataset,
  FileCheck,
  LocalShipping,
  ManageAccounts,
  NoteAdd,
  Package,
  ReceiptLong,
  ShieldCheck,
  UserCheck,
  Video,
  Wallet,
  Wrench,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

type ExecutiveQuickLinksProps = {
  links: ExecutiveQuickLink[];
  className?: string;
  title?: string;
  description?: string;
  emptyMessage?: string;
};

const MODULE_ORDER: ExecutiveQuickLink["module"][] = [
  "operations",
  "gold",
  "workforce",
  "finance",
  "maintenance",
  "compliance",
  "security",
  "reports",
  "general",
];

type IconKey =
  | "operations"
  | "gold"
  | "workforce"
  | "finance"
  | "maintenance"
  | "compliance"
  | "security"
  | "reports"
  | "general"
  | "shift-report"
  | "attendance"
  | "receive-stock"
  | "issue-stock"
  | "gold-output"
  | "gold-receipt"
  | "gold-dispatch";

const MODULE_META: Record<ExecutiveQuickLink["module"], { label: string; icon: IconKey }> = {
  operations: { label: "Operations", icon: "operations" },
  gold: { label: "Gold", icon: "gold" },
  workforce: { label: "Workforce", icon: "workforce" },
  finance: { label: "Finance", icon: "finance" },
  maintenance: { label: "Maintenance", icon: "maintenance" },
  compliance: { label: "Compliance", icon: "compliance" },
  security: { label: "Security", icon: "security" },
  reports: { label: "Reports", icon: "reports" },
  general: { label: "General", icon: "general" },
};

const QUICK_ACTION_ICON_BY_HREF: Record<string, IconKey> = {
  "/shift-report": "shift-report",
  "/attendance": "attendance",
  "/stores/receive": "receive-stock",
  "/stores/issue": "issue-stock",
  "/gold/intake/pours/new": "gold-output",
};

const LINK_ICON_BY_HREF_PREFIX: Array<{ prefix: string; icon: IconKey }> = [
  { prefix: "/reports/gold", icon: "reports" },
  { prefix: "/gold/settlement/receipts", icon: "gold-receipt" },
  { prefix: "/gold/transit/dispatches", icon: "gold-dispatch" },
  { prefix: "/gold", icon: "gold" },
  { prefix: "/human-resources", icon: "workforce" },
  { prefix: "/accounting", icon: "finance" },
  { prefix: "/maintenance", icon: "maintenance" },
  { prefix: "/compliance", icon: "compliance" },
  { prefix: "/cctv", icon: "security" },
  { prefix: "/reports", icon: "reports" },
];

function getBadgeText(link: ExecutiveQuickLink) {
  if (link.badgeLabel && typeof link.badgeCount === "number") {
    return `${link.badgeLabel}: ${link.badgeCount}`;
  }
  if (link.badgeLabel) {
    return link.badgeLabel;
  }
  if (typeof link.badgeCount === "number") {
    return String(link.badgeCount);
  }
  return null;
}

function getLinkIcon(link: ExecutiveQuickLink): IconKey {
  if (link.isPrimary) {
    return QUICK_ACTION_ICON_BY_HREF[link.href] ?? MODULE_META[link.module].icon;
  }

  const matched = LINK_ICON_BY_HREF_PREFIX.find((entry) => link.href.startsWith(entry.prefix));
  if (matched) return matched.icon;
  return MODULE_META[link.module].icon;
}

function renderIcon(icon: IconKey, className: string) {
  switch (icon) {
    case "operations":
      return <BarChart3 className={className} />;
    case "gold":
      return <Coins className={className} />;
    case "workforce":
      return <ManageAccounts className={className} />;
    case "finance":
      return <Wallet className={className} />;
    case "maintenance":
      return <Wrench className={className} />;
    case "compliance":
      return <ShieldCheck className={className} />;
    case "security":
      return <Video className={className} />;
    case "reports":
      return <FileCheck className={className} />;
    case "shift-report":
      return <NoteAdd className={className} />;
    case "attendance":
      return <UserCheck className={className} />;
    case "receive-stock":
      return <ArrowDownward className={className} />;
    case "issue-stock":
      return <ArrowUpward className={className} />;
    case "gold-output":
      return <Dataset className={className} />;
    case "gold-receipt":
      return <ReceiptLong className={className} />;
    case "gold-dispatch":
      return <LocalShipping className={className} />;
    case "general":
    default:
      return <Package className={className} />;
  }
}

function QuickActionTile({ link }: { link: ExecutiveQuickLink }) {
  const badgeText = getBadgeText(link);
  const icon = getLinkIcon(link);

  return (
    <Link
      href={link.href}
      className={cn(
        "group flex min-h-24 items-center gap-3 rounded-md border border-border/70 bg-background/70 px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {renderIcon(icon, "h-4 w-4")}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{link.label}</p>
        <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">
          {MODULE_META[link.module].label}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {badgeText ? (
          <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
            {badgeText}
          </Badge>
        ) : null}
        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5" />
      </div>
    </Link>
  );
}

function QuickLinkListItem({ link }: { link: ExecutiveQuickLink }) {
  const badgeText = getBadgeText(link);
  const icon = getLinkIcon(link);

  return (
    <li>
      <Link
        href={link.href}
        className="group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
          {renderIcon(icon, "h-3.5 w-3.5")}
        </div>
        <span className="min-w-0 flex-1 truncate">{link.label}</span>
        {badgeText ? (
          <Badge variant="secondary" className="shrink-0 font-mono text-[11px]">
            {badgeText}
          </Badge>
        ) : null}
      </Link>
    </li>
  );
}

export function ExecutiveQuickLinks({
  links,
  className,
  title = "Quick Links",
  description = "Primary quick actions first, then high-impact module workflows.",
  emptyMessage = "No quick links available.",
}: ExecutiveQuickLinksProps) {
  const sortedLinks = useMemo(() => {
    return [...links].sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      if (a.isPrimary && b.isPrimary) {
        return (a.primaryOrder ?? Number.MAX_SAFE_INTEGER) - (b.primaryOrder ?? Number.MAX_SAFE_INTEGER);
      }
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.label.localeCompare(b.label);
    });
  }, [links]);

  const primaryQuickActions = sortedLinks.filter((link) => link.isPrimary);
  const secondaryLinks = sortedLinks.filter((link) => !link.isPrimary);

  const groupedSecondaryLinks = useMemo(() => {
    const map = new Map<ExecutiveQuickLink["module"], ExecutiveQuickLink[]>();
    for (const moduleKey of MODULE_ORDER) {
      map.set(moduleKey, []);
    }

    secondaryLinks.forEach((link) => {
      const list = map.get(link.module) ?? [];
      list.push(link);
      map.set(link.module, list);
    });

    return MODULE_ORDER.map((moduleKey) => ({
      module: moduleKey,
      label: MODULE_META[moduleKey].label,
      icon: MODULE_META[moduleKey].icon,
      links: map.get(moduleKey) ?? [],
    })).filter((group) => group.links.length > 0);
  }, [secondaryLinks]);

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {primaryQuickActions.length > 0 ? (
          <div className="mb-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Primary Quick Actions
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {primaryQuickActions.map((link) => (
                <QuickActionTile key={link.href} link={link} />
              ))}
            </div>
          </div>
        ) : null}

        {groupedSecondaryLinks.length === 0 && primaryQuickActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          groupedSecondaryLinks.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quick Links
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupedSecondaryLinks.map((group) => (
                  <div key={group.module} className="rounded-md border border-border/60 bg-background/60 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      {renderIcon(group.icon, "h-4 w-4 text-muted-foreground")}
                      <p className="text-sm font-semibold">{group.label}</p>
                    </div>
                    <ul className="space-y-1">
                      {group.links.map((link) => (
                        <QuickLinkListItem key={link.href} link={link} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}
      </CardContent>
    </Card>
  );
}

export default ExecutiveQuickLinks;
