"use client";

import * as React from "react";
import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import { ChevronDown, ChevronRight, Home } from "@/lib/icons";
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
          "h-[34px] rounded-[10px] border border-transparent px-2.5 text-[14px] font-medium",
          "text-[var(--text-body)] hover:bg-[var(--surface-subtle)] hover:text-foreground",
          "data-[active=true]:border-transparent data-[active=true]:bg-[var(--surface-muted)] data-[active=true]:text-foreground data-[active=true]:shadow-none",
          className,
        )}
      >
        <Link href={item.href}>
          <item.icon className="h-4 w-4 text-muted-foreground" />
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
            className="h-9 text-[15px]"
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
                "h-9 rounded-[10px] border border-transparent px-2.5",
                "text-[14px] font-medium hover:bg-[var(--surface-subtle)]",
                "data-[active=true]:border-transparent data-[active=true]:bg-[var(--surface-muted)] data-[active=true]:shadow-none",
              )}
            >
              {React.createElement(sectionIcon, {
                className: cn(
                  "h-4 w-4 text-muted-foreground",
                  hasActiveChild ? "text-foreground" : "",
                ),
              })}
              <span className="truncate normal-case font-medium tracking-normal text-[var(--text-body)]">
                {section.title}
              </span>
              {!isCollapsed ? (
                isOpen ? (
                  <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                )
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupLabel>
      {!isCollapsed && isOpen ? (
        <SidebarGroupContent className="mt-0 pl-4 pr-0.5">
          <SidebarMenu className="relative ml-2 gap-0 border-l border-[var(--edge-default)] pl-2.5">
            {section.items.map((item) => (
              <SidebarNavLink
                key={item.href}
                item={item}
                isActive={item.href === activeHref}
                className="h-8 rounded-[8px] px-2 text-[13px]"
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
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
              className="h-9 rounded-[10px] border border-transparent px-2.5 text-[15px] font-medium data-[active=true]:border-transparent data-[active=true]:bg-[var(--surface-muted)] data-[active=true]:shadow-none"
            >
              <Link href={href}>
                <Home className="h-4 w-4 text-muted-foreground" />
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
