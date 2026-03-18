"use client";

import * as React from "react";
import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import type { WorkspaceNavSection } from "@/lib/workspaces";
import { ChevronRight, Home } from "@/lib/icons";
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
        className={cn("h-8 text-[12.5px]", className)}
      >
        <Link href={item.href}>
          <item.icon className="h-4 w-4" />
          <span>{item.label}</span>
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
    <SidebarGroup key={section.id} className="space-y-1">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarNavLink
            item={item}
            isActive={item.href === activeHref}
            className="h-9 font-medium"
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
    <SidebarGroup key={section.id} className="space-y-1">
      <SidebarGroupContent>
        <SidebarMenu>
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
    <SidebarGroup key={section.id} className="space-y-1">
      <SidebarGroupLabel className="p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              onClick={onToggle}
              isActive={hasActiveChild}
              tooltip={section.title}
              className="h-10"
            >
              {React.createElement(sectionIcon, {
                className: cn(
                  "h-4 w-4",
                  hasActiveChild ? "text-primary" : "text-muted-foreground",
                ),
              })}
              <span className="font-semibold">{section.title}</span>
              {!isCollapsed ? (
                <ChevronRight
                  className={cn(
                    "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                    isOpen ? "rotate-90" : "",
                  )}
                />
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupLabel>
      {!isCollapsed && isOpen ? (
        <SidebarGroupContent className="pl-4 pr-1">
          <SidebarMenu className="pl-2">
            {section.items.map((item) => (
              <SidebarNavLink
                key={item.href}
                item={item}
                isActive={item.href === activeHref}
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
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={label}
              className="h-9 font-semibold"
            >
              <Link href={href}>
                <Home className="h-4 w-4" />
                <span className="font-semibold">{label}</span>
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
