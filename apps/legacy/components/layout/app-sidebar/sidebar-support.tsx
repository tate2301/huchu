"use client";

import { Circle, HelpCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";

export function SidebarSupport({
  isCollapsed,
  guidedModeEnabled,
  onToggleGuidedMode,
}: {
  isCollapsed: boolean;
  guidedModeEnabled: boolean;
  onToggleGuidedMode: () => void;
}) {
  return (
    <SidebarGroup className="mt-auto pb-1">
      <SidebarGroupContent className="mt-0.5">
        <div className={cn("mt-2 flex items-center px-1", isCollapsed ? "justify-center" : "justify-start")}>
          <button
            type="button"
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-full border transition-[background-color,color,transform,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:scale-[1.03] lg:size-8",
              guidedModeEnabled
                ? "border-[var(--action-primary-bg)] bg-[var(--action-secondary-bg)] text-[var(--action-primary-bg)] shadow-[inset_0_0_0_1px_var(--action-primary-bg)]"
                : "border-[var(--edge-default)] bg-[var(--surface-base)] text-muted-foreground hover:bg-[var(--surface-subtle)]",
            )}
            onClick={onToggleGuidedMode}
            aria-label={guidedModeEnabled ? "Disable guided tips" : "Enable guided tips"}
          >
            {guidedModeEnabled ? <HelpCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
