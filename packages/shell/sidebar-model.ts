import type { LucideIcon } from "@corelithzw/ui/lib/icons";
import type { NavigationItem, NavigationSection } from "./navigation";

/**
 * What the sidebar renders: a home, a workspace label and icon, quick actions,
 * the sections in two bands, the support items. A host resolves it from the
 * signed-in person's role, features and workspace profile (`resolveModel` on
 * `AppSidebar`); the shell renders whatever comes back and names no module.
 */
export type WorkspaceSectionGroup = "primary" | "additional";

export type WorkspaceNavSection = NavigationSection & {
  workspaceGroup?: WorkspaceSectionGroup;
};

export type WorkspaceSidebarModel = {
  homeHref: string;
  homeLabel: string;
  workspaceLabel: string;
  workspaceIcon: LucideIcon;
  quickActions: NavigationItem[];
  sections: WorkspaceNavSection[];
  supportItems: NavigationItem[];
};

export type SidebarModelArgs = {
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
  workspaceProfile: string | null | undefined;
};
