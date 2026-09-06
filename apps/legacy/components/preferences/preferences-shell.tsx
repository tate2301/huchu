"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { NavRail } from "@corelithzw/ui/components/nav-rail";
import { NavGroup, NavItem } from "@corelithzw/ui/components/settings-rail";

import {
  ACCOUNT_PREFERENCES_ITEMS,
  ORGANIZATION_PREFERENCES_ITEMS,
  canViewPreferenceItem,
  type PreferencesNavItem,
} from "@corelithzw/platform/preferences/nav";
import {
  Bell,
  Building2,
  Coins,
  Grid3x3,
  MedusaBookOpenIcon,
  MedusaCircleSlidersIcon,
  MedusaIdBadgeIcon,
  Palette,
  UserRound,
  Users,
} from "@corelithzw/ui/lib/icons";

type PreferencesShellProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

const itemIcons: Record<string, React.ElementType> = {
  profile: UserRound,
  notifications: Bell,
  appearance: Palette,
  organization: Building2,
  users: MedusaIdBadgeIcon,
  sites: Grid3x3,
  departments: Users,
  branding: MedusaCircleSlidersIcon,
  templates: MedusaBookOpenIcon,
  billing: Coins,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function renderNavItems(items: PreferencesNavItem[], pathname: string) {
  return items.map((item) => {
    const Icon = itemIcons[item.id];
    return (
      <NavItem
        key={item.id}
        to={item.href}
        active={isActive(pathname, item.href)}
        icon={Icon ? <Icon className="size-4" aria-hidden="true" /> : undefined}
      >
        {item.label}
      </NavItem>
    );
  });
}

export function PreferencesShell({
  title,
  description,
  actions,
  children,
}: PreferencesShellProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures;

  const accountItems = ACCOUNT_PREFERENCES_ITEMS;
  const organizationItems = React.useMemo(
    () =>
      ORGANIZATION_PREFERENCES_ITEMS.filter((item) =>
        canViewPreferenceItem(item.id, { role, enabledFeatures }),
      ),
    [enabledFeatures, role],
  );

  return (
    <div className="settings-layout container mx-auto w-full">
      {/* Same trade as the management shell: a rail beside the content on a
          desktop, a scrolling strip above it on a phone. */}
      <NavRail
        className="settings-rail"
        label="Preferences navigation"
        orientation="responsive"
      >
        <NavGroup label="Account">
          {renderNavItems(accountItems, pathname)}
        </NavGroup>
        {organizationItems.length > 0 ? (
          <NavGroup label="Organization">
            {renderNavItems(organizationItems, pathname)}
          </NavGroup>
        ) : null}
      </NavRail>

      {/* Title and actions to the app bar, the same as the management shell
          and every module beside it. Drawn in the page, the title was the
          second copy of a word the bar was already showing, and it cost about
          a hundred and ten pixels of a 844px screen to say it again. */}
      <PageChrome title={title}>{actions}</PageChrome>

      <main className="settings-content">
        {description ? (
          <p className="t-body t-muted max-w-[var(--content-max)]">
            {description}
          </p>
        ) : null}
        <div className="space-y-4">{children}</div>
      </main>
    </div>
  );
}
