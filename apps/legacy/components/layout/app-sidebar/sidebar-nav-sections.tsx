"use client";

import * as React from "react";
import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import {
  MedusaChevronDownIcon,
  MedusaChevronRightIcon,
  MedusaHouseIcon,
} from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@corelithzw/ui/components/sidebar";

import {
  getSectionIcon,
  isDirectLinkSection,
  isFlatLinkSection,
} from "./sidebar-helpers";

type NavBand = { id: string | null; label: string | null; items: NavItem[] };

/**
 * Split a section's items into its declared groups.
 *
 * Ungrouped items lead, unlabelled — so a section that declares no groups
 * comes back as one anonymous band and renders exactly as it always has.
 * Order follows `section.groups`, not the order items happen to appear in.
 */
function groupItems(section: WorkspaceNavSection): NavBand[] {
  const groups = section.groups ?? [];
  if (groups.length === 0) {
    return [{ id: null, label: null, items: section.items }];
  }

  const ungrouped = section.items.filter((item) => !item.group);
  const bands: NavBand[] = ungrouped.length
    ? [{ id: null, label: null, items: ungrouped }]
    : [];

  for (const group of groups) {
    const items = section.items.filter((item) => item.group === group.id);
    if (items.length > 0) bands.push({ id: group.id, label: group.label, items });
  }
  return bands;
}

function SidebarNavLink({
  item,
  isActive,
  className,
}: {
  item: NavItem;
  isActive: boolean;
  className?: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        asChild
        size="sm"
        isActive={isActive}
        tooltip={item.label}
        className={cn("h-11 px-2.5 lg:h-9", className)}
      >
        <Link
          href={item.href}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          <item.icon
            className={cn(
              "h-4 w-4 transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
              isActive
                ? "text-[var(--sidebar-item-active-fg)]"
                : "text-[var(--sidebar-item-icon)]",
            )}
          />
          <span className="truncate">{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarDirectSectionLink({
  section,
  activeHref,
}: {
  section: WorkspaceNavSection;
  activeHref: string | null;
}) {
  const item = section.items[0];
  return (
    <SidebarGroup key={section.id} className="space-y-0 py-0.5">
      <SidebarGroupContent className="mt-0">
        <SidebarMenu className="gap-1">
          <SidebarNavLink
            item={item}
            isActive={item.href === activeHref}
            className="h-11 text-[14px] lg:h-10"
          />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarFlatSection({
  section,
  activeHref,
}: {
  section: WorkspaceNavSection;
  activeHref: string | null;
}) {
  return (
    <SidebarGroup key={section.id} className="space-y-0 py-0.5">
      <SidebarGroupContent className="mt-0">
        <SidebarMenu className="gap-1">
          {section.items.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              isActive={item.href === activeHref}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarExpandableSection({
  section,
  activeHref,
  isCollapsed,
  isOpen,
  onToggle,
}: {
  section: WorkspaceNavSection;
  activeHref: string | null;
  isCollapsed: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const sectionIcon = getSectionIcon(section);
  const hasActiveChild = section.items.some((item) => item.href === activeHref);

  return (
    <SidebarGroup key={section.id} className="space-y-0 py-0.5">
      <SidebarGroupLabel className="p-0">
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              onClick={onToggle}
              isActive={hasActiveChild}
              tooltip={section.title}
              className="h-11 bg-transparent px-2.5 lg:h-9"
            >
              {React.createElement(sectionIcon, {
                className: cn(
                  "h-4 w-4 text-[var(--sidebar-item-icon)]",
                  hasActiveChild ? "text-[var(--sidebar-item-active-fg)]" : "",
                ),
              })}
              <span className="truncate normal-case font-medium tracking-normal">
                {section.title}
              </span>
              {!isCollapsed ? (
                isOpen ? (
                  <MedusaChevronDownIcon className="ml-auto h-4 w-4 text-[var(--sidebar-item-icon)]" />
                ) : (
                  <MedusaChevronRightIcon className="ml-auto h-4 w-4 text-[var(--sidebar-item-icon)]" />
                )
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupLabel>
      {!isCollapsed ? (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-[var(--motion-duration-base)] ease-[var(--motion-ease-standard)]",
            isOpen
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-70",
          )}
        >
          <div className="overflow-hidden">
            <SidebarGroupContent className="mt-0 pl-4 pr-0.5">
              <SidebarMenu className="relative ml-2 gap-1 pl-2.5">
                {groupItems(section).map((band) => (
                  <React.Fragment key={band.id ?? "__ungrouped"}>
                    {band.label ? (
                      <li
                        className="px-2 pb-0.5 pt-2 text-sm font-medium uppercase tracking-wide text-[var(--text-subtle)]"
                        aria-hidden="true"
                      >
                        {band.label}
                      </li>
                    ) : null}
                    {band.items.map((item) => (
                      <SidebarNavLink
                        key={item.href}
                        item={item}
                        isActive={item.href === activeHref}
                        className="h-10 rounded-[8px] px-2 text-[14px] lg:h-8"
                      />
                    ))}
                  </React.Fragment>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </div>
        </div>
      ) : null}
    </SidebarGroup>
  );
}

export function SidebarHomeLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup className="py-0.5">
      <SidebarGroupContent className="mt-0">
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={label}
              className="h-11 px-2.5 lg:h-9"
            >
              <Link
                href={href}
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                }}
              >
                <MedusaHouseIcon
                  className={cn(
                    "h-4 w-4",
                    isActive
                      ? "text-[var(--sidebar-item-active-fg)]"
                      : "text-[var(--sidebar-item-icon)]",
                  )}
                />
                <span className="truncate">{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function SidebarNavSections({
  sections,
  activeHref,
  isCollapsed,
  openSectionId,
  onToggleSection,
}: {
  sections: WorkspaceNavSection[];
  activeHref: string | null;
  isCollapsed: boolean;
  openSectionId: string | null;
  onToggleSection: (sectionId: string) => void;
}) {
  return (
    <>
      {sections.flatMap((section) => {
        // A flattened section is not one entry with bands inside it — it is
        // several entries. Split before anything else looks at it, so each
        // group opens and closes on its own like any other root entry.
        if (section.flattenGroups && section.groups?.length) {
          const ungrouped = section.items.filter((item) => !item.group);
          const bands = section.groups
            .map((group) => ({
              group,
              items: section.items.filter((item) => item.group === group.id),
            }))
            .filter((band) => band.items.length > 0);

          return [
            // Items with no group are destinations in their own right — an
            // overview page is not a category to expand.
            ...ungrouped.map((item) => (
              <SidebarDirectSectionLink
                key={`${section.id}-${item.href}`}
                section={{ ...section, items: [item], title: item.label }}
                activeHref={activeHref}
              />
            )),
            ...bands.map(({ group, items }) => {
              const id = `${section.id}-${group.id}`;
              return (
                <SidebarExpandableSection
                  key={id}
                  section={{ ...section, id, title: group.label, groups: undefined, items }}
                  activeHref={activeHref}
                  isCollapsed={isCollapsed}
                  isOpen={openSectionId === id}
                  onToggle={() => onToggleSection(id)}
                />
              );
            }),
          ];
        }

        if (isDirectLinkSection(section)) {
          return [
            <SidebarDirectSectionLink
              key={section.id}
              section={section}
              activeHref={activeHref}
            />,
          ];
        }

        if (isFlatLinkSection(section)) {
          return [
            <SidebarFlatSection
              key={section.id}
              section={section}
              activeHref={activeHref}
            />,
          ];
        }

        return [
          <SidebarExpandableSection
            key={section.id}
            section={section}
            activeHref={activeHref}
            isCollapsed={isCollapsed}
            isOpen={openSectionId === section.id}
            onToggle={() => onToggleSection(section.id)}
          />,
        ];
      })}
    </>
  );
}
