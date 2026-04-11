"use client";

import * as React from "react";
import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import { MedusaChevronDownIcon, MedusaChevronRightIcon, MedusaHouseIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import {
  getSectionIcon,
  isDirectLinkSection,
  isFlatLinkSection,
} from "./sidebar-helpers";

function SidebarNavLink({
  item,
  isActive,
  className,
}: {
  item: NavItem;
  isActive: boolean;
  className?: string;
}) {
  return (
    <SidebarMenuItem key={item.href}>
      <SidebarMenuButton
        asChild
        size="sm"
        isActive={isActive}
        tooltip={item.label}
        className={cn(
          "h-11 rounded-[10px] border border-transparent px-2.5 text-[14px] font-medium lg:h-9",
          "text-[var(--sidebar-item-fg-muted)] transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
          "hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-item-hover-fg)]",
          "data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-item-active-border)]",
          className,
        )}
      >
        <Link href={item.href}>
          <item.icon
            className={cn(
              "h-4 w-4 transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)]",
              isActive ? "text-[var(--sidebar-item-active-fg)]" : "text-[var(--sidebar-item-icon)]",
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
    <SidebarGroup key={section.id} className="space-y-0 py-0">
      <SidebarGroupContent className="mt-0">
        <SidebarMenu className="gap-0">
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
    <SidebarGroup key={section.id} className="space-y-0 py-0">
      <SidebarGroupContent className="mt-0">
        <SidebarMenu className="gap-0">
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
    <SidebarGroup key={section.id} className="space-y-0 py-0">
      <SidebarGroupLabel className="p-0">
        <SidebarMenu className="gap-0">
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              onClick={onToggle}
              isActive={hasActiveChild}
              tooltip={section.title}
              className={cn(
                "h-11 rounded-[10px] border border-transparent px-2.5 lg:h-9",
                "text-[14px] font-medium text-[var(--sidebar-item-fg-muted)] transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-item-hover-fg)]",
                "data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-item-active-border)]",
              )}
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
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70",
          )}
        >
          <div className="overflow-hidden">
            <SidebarGroupContent className="mt-0 pl-4 pr-0.5">
              <SidebarMenu className="relative ml-2 gap-0 border-l border-[var(--edge-default)] pl-2.5">
                {section.items.map((item) => (
                  <SidebarNavLink
                    key={item.href}
                    item={item}
                    isActive={item.href === activeHref}
                    className="h-10 rounded-[8px] px-2 text-[14px] lg:h-8"
                  />
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
  return (
    <SidebarGroup className="py-0">
      <SidebarGroupContent className="mt-0">
        <SidebarMenu className="gap-0">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={label}
              className="h-11 rounded-[10px] border border-transparent px-2.5 text-[14px] font-medium text-[var(--sidebar-item-fg-muted)] transition-[background-color,color,transform] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:translate-x-[1px] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-item-hover-fg)] data-[active=true]:border-[var(--sidebar-item-active-border)] data-[active=true]:bg-[var(--sidebar-item-active-bg)] data-[active=true]:text-[var(--sidebar-item-active-fg)] data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-item-active-border)] lg:h-9"
            >
              <Link href={href}>
                <MedusaHouseIcon
                  className={cn(
                    "h-4 w-4",
                    isActive ? "text-[var(--sidebar-item-active-fg)]" : "text-[var(--sidebar-item-icon)]",
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
      {sections.map((section) => {
        if (isDirectLinkSection(section)) {
          return (
            <SidebarDirectSectionLink
              key={section.id}
              section={section}
              activeHref={activeHref}
            />
          );
        }

        if (isFlatLinkSection(section)) {
          return (
            <SidebarFlatSection
              key={section.id}
              section={section}
              activeHref={activeHref}
            />
          );
        }

        return (
          <SidebarExpandableSection
            key={section.id}
            section={section}
            activeHref={activeHref}
            isCollapsed={isCollapsed}
            isOpen={openSectionId === section.id}
            onToggle={() => onToggleSection(section.id)}
          />
        );
      })}
    </>
  );
}
