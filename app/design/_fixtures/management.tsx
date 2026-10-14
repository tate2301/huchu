"use client";

import * as React from "react";

import { SettingsRail, SettingsSurface, type SettingsRailGroup } from "@/components/management/ui";
import {
  AlertTriangle,
  Bell,
  Building2,
  ChartBar,
  FileCheck,
  FileText,
  History,
  IdentificationCard,
  Layers,
  ListBullets,
  MapPin,
  MedusaBookOpenIcon,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  Storefront,
  UserRound,
  Users,
  VaneIcon,
  Wallet,
} from "@/lib/icons";

/** Management's tree as the board draws it for Floorcode, with the board's counts. */
export function fixtureManagementGroups(active: string): SettingsRailGroup[] {
  const item = (id: string, label: string, icon: SettingsRailGroup["items"][number]["icon"], count?: number) => ({
    id,
    label,
    icon,
    count,
    href: `#${id}`,
    active: id === active,
  });
  return [
    { id: "people", label: "People", items: [item("users", "Users", Users, 6), item("departments", "Departments", Building2), item("job-grades", "Job grades", IdentificationCard, 4)] },
    { id: "operations", label: "Operations", items: [item("sites", "Sites", MapPin), item("sections", "Sections", Layers)] },
    {
      id: "shop",
      label: "Shop",
      items: [item("tills", "Tills", Storefront), item("till-rules", "Till rules", ListBullets), item("posting", "Posting", ChartBar), item("fiscal", "Fiscal device", FileCheck)],
    },
    {
      id: "compliance",
      label: "Compliance",
      items: [item("permits", "Permits", FileCheck), item("inspections", "Inspections", ShieldCheck), item("incidents", "Incidents", AlertTriangle), item("training", "Training", MedusaBookOpenIcon)],
    },
    {
      id: "company",
      label: "Company",
      items: [item("general", "General", SlidersHorizontal), item("branding", "Branding", Palette), item("templates", "Templates", FileText), item("reports", "Reports", ChartBar), item("activity", "Activity", History)],
    },
    {
      id: "apps",
      label: "Apps",
      items: [item("billing", "Billing", Wallet), item("integrations", "Integrations", Layers, 5), item("marketplace", "Marketplace", Storefront), item("vane", "Vane", VaneIcon)],
    },
    { id: "my-account", label: "My account", items: [item("profile", "Profile", UserRound), item("notifications", "Notifications", Bell), item("appearance", "Appearance", SlidersHorizontal)] },
  ];
}

/** Management's surface with the fixture tree, around a page. */
export function FixtureManagement({ active, children }: { active: string; children: React.ReactNode }) {
  return (
    <SettingsSurface
      open
      onOpenChange={() => {}}
      title="Management"
      rail={<SettingsRail groups={fixtureManagementGroups(active)} backHref="#back" backLabel="Back to Floorcode" title="Management" />}
    >
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-y-auto max-[1099px]:block max-[1099px]:overflow-visible">{children}</div>
    </SettingsSurface>
  );
}
