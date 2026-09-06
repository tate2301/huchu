// Deep imports are the norm (`@corelithzw/shell/module-shell`); this entry
// carries what a host needs by name to compose itself.
export { registerNavigationSections, navigationSections, navigationSectionsForRole } from "./navigation";
export type { NavigationSection, NavigationItem, NavigationGroup } from "./navigation";
export type { SidebarModelArgs, WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel } from "./sidebar-model";
export { registerManagementNavigation } from "./management";
export type { ManagementNavigation, ManagementNavItem, ManagementModuleItem } from "./management";
