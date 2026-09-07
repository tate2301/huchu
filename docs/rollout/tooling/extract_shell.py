"""Phase 2.3j: the app shell to packages/shell — sidebar, navbar, command palette, breadcrumbs, providers, auth forms —
with slots the host fills from its own app-shell.tsx. The host keeps its composition files."""
import os, re, subprocess, sys
ROOT="/home/user/huchu"; APP=f"{ROOT}/apps/legacy"; SH=f"{ROOT}/packages/shell"
def sh(c): subprocess.run(c, shell=True, check=True, cwd=ROOT)
def edit(path, pairs):
    s=open(path).read()
    for old,new,count in pairs:
        n=s.count(old); assert n==count,(path,old[:70],n,count)
    for old,new,count in pairs: s=s.replace(old,new)
    open(path,"w").write(s)
def walk(base):
    for dp,dn,fn in os.walk(base):
        dn[:]=[d for d in dn if d not in ("node_modules",".next",".turbo")]
        for f in fn:
            if f.endswith((".ts",".tsx")): yield os.path.join(dp,f)
steps=sys.argv[1:] or ["all"]
def want(x): return "all" in steps or x in steps

MOVES=[("components/layout/app-sidebar.tsx","app-sidebar.tsx"),
 ("components/layout/app-sidebar/sidebar-account-menu.tsx","app-sidebar/sidebar-account-menu.tsx"),
 ("components/layout/app-sidebar/sidebar-collection.tsx","app-sidebar/sidebar-collection.tsx"),
 ("components/layout/app-sidebar/sidebar-helpers.ts","app-sidebar/sidebar-helpers.ts"),
 ("components/layout/app-sidebar/sidebar-nav-sections.tsx","app-sidebar/sidebar-nav-sections.tsx"),
 ("components/layout/app-sidebar/sidebar-quick-actions.tsx","app-sidebar/sidebar-quick-actions.tsx"),
 ("components/layout/app-sidebar/sidebar-support.tsx","app-sidebar/sidebar-support.tsx"),
 ("components/layout/navbar.tsx","navbar.tsx"),
 ("components/layout/command-bar/command-bar.tsx","command-bar/command-bar.tsx"),
 ("components/layout/command-bar/command-bar-types.ts","command-bar/command-bar-types.ts"),
 ("components/layout/breadcrumbs.tsx","breadcrumbs.tsx"),
 ("components/layout/breadcrumbs.test.ts","breadcrumbs.test.ts"),
 ("components/layout/guided-mode-toggle.tsx","guided-mode-toggle.tsx"),
 ("components/providers/session-provider.tsx","providers/session-provider.tsx"),
 ("components/providers/appearance-provider.tsx","providers/appearance-provider.tsx"),
 ("components/providers/session-ssr.test.ts","providers/session-ssr.test.ts"),
 ("components/auth/login-form.tsx","auth/login-form.tsx"),
 ("components/auth/portal-login-form.tsx","auth/portal-login-form.tsx"),
 ("components/auth/role-gate.tsx","auth/role-gate.tsx")]
# app specifier -> package specifier (exact matches first, then prefixes)
MAP=[("@/components/layout/app-sidebar/sidebar-crm-collections","@/components/crm/sidebar-crm-collections")]+[
 (f"@/{src[:-4] if src.endswith('.tsx') else src[:-3]}", f"@corelithzw/shell/{dst[:-4] if dst.endswith('.tsx') else dst[:-3]}") for src,dst in MOVES if not src.endswith(".test.ts")]
def target(spec):
    for old,new in MAP:
        if spec==old: return new
    return None

if want("move"):
    for d in ["app-sidebar","command-bar","providers","auth"]: os.makedirs(f"{SH}/{d}", exist_ok=True)
    for src,dst in MOVES: sh(f'git mv "{APP}/{src}" "{SH}/{dst}"')
    sh(f'git mv "{APP}/components/layout/app-sidebar/sidebar-crm-collections.tsx" "{APP}/components/crm/sidebar-crm-collections.tsx"')
    for d in ["components/layout/app-sidebar","components/auth"]:
        if os.path.isdir(f"{APP}/{d}") and not os.listdir(f"{APP}/{d}"): os.rmdir(f"{APP}/{d}")
    print("moved")

if want("rewrite"):
    SPEC=re.compile(r'(["\'])(@/[^"\']+)\1'); n=0
    for p in walk(APP):
        s=open(p).read(); new=SPEC.sub(lambda m: f"{m.group(1)}{target(m.group(2)) or m.group(2)}{m.group(1)}", s)
        if new!=s: open(p,"w").write(new); n+=1
    m=0
    for p in walk(SH):
        s=open(p).read(); d=os.path.dirname(p)
        def repl(mm):
            spec=mm.group(2)
            t=target(spec) if spec.startswith("@/") else spec
            if t is None:
                # the shell's own neighbours and the kernel, by their new names
                t={"@/lib/auth-redirect":"@corelithzw/platform/auth-core/redirects",
                   "@/lib/navigation":"@corelithzw/shell/navigation",
                   "@/lib/workspaces":"@corelithzw/shell/sidebar-model"}.get(spec, spec)
            if not t.startswith("@corelithzw/shell/"): return f'{mm.group(1)}{t}{mm.group(1)}'
            r=os.path.relpath(os.path.join(SH, t[len("@corelithzw/shell/"):]), d)
            return f'{mm.group(1)}{r if r.startswith(".") else "./"+r}{mm.group(1)}'
        new=re.compile(r'(["\'])(@/[^"\']+|@corelithzw/shell/[^"\']+)\1').sub(repl, s)
        if new!=s: open(p,"w").write(new); m+=1
    print(f"rewritten app={n} shell={m}")

if want("seams"):
    # the sidebar model's types live with the sidebar; the host's resolver keeps implementing them
    open(f"{SH}/sidebar-model.ts","w").write('''import type { LucideIcon } from "@corelithzw/ui/lib/icons";
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
''')
    # the shell's navigation keeps the hosts' names for its types
    edit(f"{SH}/navigation.ts", [("export type NavigationGroup = { id: string; label: string };\n",
        "export type NavigationGroup = { id: string; label: string };\n\n/** The hosts' names for the same shapes. */\nexport type NavItem = NavigationItem;\nexport type NavGroup = NavigationGroup;\nexport type NavSection = NavigationSection;\n", 1)])
    # sidebar: the model comes from the host, the collections are a slot
    p=f"{SH}/app-sidebar.tsx"
    edit(p, [
        ('import { useQuery } from "@tanstack/react-query";\n', '', 1),
        ('import { fetchStockLocations } from "@/lib/api";\n', '', 1),
        ('import { hasTokenFeature } from "@corelithzw/platform/gating/token-check";\n', '', 1),
        ('import { getWorkspaceSidebarModel } from "./sidebar-model";\n', 'import type { SidebarModelArgs, WorkspaceSidebarModel } from "./sidebar-model";\n', 1),
        ('import { SidebarCrmCollections } from "@/components/crm/sidebar-crm-collections";\n', '', 1),
        ('export function AppSidebar() {\n', '''export function AppSidebar({
  resolveModel,
  collections,
}: {
  /** The host's answer to what this person's sidebar holds; see `sidebar-model.ts`. */
  resolveModel: (args: SidebarModelArgs) => WorkspaceSidebarModel;
  /** The person's own shelves, rendered below the product's structure. */
  collections?: React.ReactNode;
}) {
''', 1),
        ('''  // Which stock surfaces are worth offering depends on how the stock is laid
  // out, and that is a fact about the tenant rather than about its plan — a
  // transfer needs two active locations at one site before it has anywhere to
  // go. Only asked for where a stock surface could appear at all.
  const stockLocationsQuery = useQuery({
    queryKey: ["stock-locations", "active"],
    queryFn: () => fetchStockLocations({ active: true, limit: 200 }),
    enabled: hasTokenFeature(enabledFeatures, "stores.inventory"),
    staleTime: 5 * 60_000,
  });
  const activeStockLocationSiteIds = React.useMemo(
    () => stockLocationsQuery.data?.data.map((location) => location.siteId),
    [stockLocationsQuery.data],
  );

  const sidebarModel = React.useMemo(
    () =>
      getWorkspaceSidebarModel({
        role,
        enabledFeatures,
        workspaceProfile,
        activeStockLocationSiteIds,
      }),
    [activeStockLocationSiteIds, enabledFeatures, role, workspaceProfile],
  );
''', '''  const sidebarModel = React.useMemo(
    () => resolveModel({ role, enabledFeatures, workspaceProfile }),
    [enabledFeatures, resolveModel, role, workspaceProfile],
  );
''', 1),
        ('        <SidebarCrmCollections isCollapsed={isCollapsed} />\n', '        {collections}\n', 1),
    ])
    # navbar: the tools and the members are slots; the destinations come from the registry
    p=f"{SH}/navbar.tsx"
    edit(p, [
        ('import { useSession } from "next-auth/react";\n', '', 1),
        ('import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";\n', '', 1),
        ('import { OfflineStatusButton } from "@corelithzw/module-offline/components/offline-status-button";\n', '', 1),
        ('import { CrmMembers } from "@/components/crm/crm-members";\n', '', 1),
        ('import { NotificationCenter } from "@corelithzw/module-notifications/components/notification-center";\n', '', 1),
        ('import { navSections } from "./navigation";\n', 'import { navigationSections } from "./navigation";\n', 1),
        ('import { canAccessCapabilityWithToken } from "@corelithzw/platform/gating/token-check";\n', '', 1),
        ('  for (const section of navSections) {\n', '  for (const section of navigationSections()) {\n', 1),
        ('export function Navbar() {\n', '''export function Navbar({
  tools,
  members,
}: {
  /** The quiet icons at the right: the command palette, the modules' status buttons. */
  tools?: ReactNode;
  /** Who else is in this book, shown on the wide layout when the host says so. */
  members?: ReactNode;
}) {
''', 1),
        ('''  const { data: session } = useSession();
  const enabledFeatures = (
    session?.user as { enabledFeatures?: string[] } | undefined
  )?.enabledFeatures;
  const showNotificationCenter = canAccessCapabilityWithToken(
    "notification.center.widget",
    enabledFeatures,
  ).allowed;
''', '', 1),
        ('''  // The CRM is the one module that is genuinely a shared book, so it is the
  // one that shows you who else is in it.
  const showMembers = pathname === "/crm" || pathname.startsWith("/crm/");
''', '', 1),
        ('''              {showMembers ? <CrmMembers className="mr-1" /> : null}
              <GlobalCommandBar />
              <OfflineStatusButton />
              {showNotificationCenter ? <NotificationCenter /> : null}
''', '''              {members}
              {tools}
''', 1),
        ('''              <GlobalCommandBar />
              <OfflineStatusButton />
              {showNotificationCenter ? <NotificationCenter /> : null}
''', '''              {tools}
''', 1),
    ])
    # the host's navigation data uses the shell's types
    p=f"{APP}/lib/navigation.ts"; s=open(p).read()
    a=s.index("export type NavItem = {"); b=s.index("export const navSections: NavSection[] = [")
    s=s[:a]+'''import type { NavGroup, NavItem, NavSection } from "@corelithzw/shell/navigation";

export type { NavGroup, NavItem, NavSection };

'''+s[b:]
    open(p,"w").write(s)
    # the host's workspace model implements the shell's shapes
    p=f"{APP}/lib/workspaces.ts"
    edit(p, [
        ('import type { NavGroup, NavItem, NavSection } from "@/lib/navigation";\n', 'import type { NavGroup, NavItem, NavSection } from "@corelithzw/shell/navigation";\nimport type {\n  SidebarModelArgs,\n  WorkspaceNavSection,\n  WorkspaceSectionGroup,\n  WorkspaceSidebarModel,\n} from "@corelithzw/shell/sidebar-model";\n', 1),
        ('''export type WorkspaceSectionGroup = "primary" | "additional";

export type WorkspaceNavSection = NavSection & {
  workspaceGroup?: WorkspaceSectionGroup;
};

export type WorkspaceSidebarModel = {
  homeHref: string;
  homeLabel: string;
  workspaceLabel: string;
  workspaceIcon: LucideIcon;
  quickActions: NavItem[];
  sections: WorkspaceNavSection[];
  supportItems: NavItem[];
};

type WorkspaceModelArgs = {
  role: string | null | undefined;
  enabledFeatures: string[] | undefined;
  workspaceProfile: string | null | undefined;
''', '''export type { WorkspaceNavSection, WorkspaceSectionGroup, WorkspaceSidebarModel };

export type WorkspaceModelArgs = SidebarModelArgs & {
''', 1),
    ])
    # the CRM's shelves read the sidebar's state themselves
    p=f"{APP}/components/crm/sidebar-crm-collections.tsx"
    edit(p, [
        ('import { SidebarCollection, type SidebarCollectionEntry } from "./sidebar-collection";\n', 'import { useSidebar } from "@corelithzw/ui/components/sidebar";\nimport { SidebarCollection, type SidebarCollectionEntry } from "@corelithzw/shell/app-sidebar/sidebar-collection";\n', 1),
        ('export function SidebarCrmCollections({ isCollapsed }: { isCollapsed?: boolean }) {\n', 'export function SidebarCrmCollections() {\n  const isCollapsed = useSidebar().state === "collapsed";\n', 1),
    ])
    # the host composes: the shell's sidebar and navbar with the host's slots
    p=f"{APP}/components/layout/app-shell.tsx"
    edit(p, [
        ('import { usePathname } from "next/navigation";\n', 'import { usePathname } from "next/navigation";\nimport { useSession } from "next-auth/react";\nimport { useQuery } from "@tanstack/react-query";\n', 1),
        ('import { Navbar } from "@corelithzw/shell/navbar";\nimport { AppSidebar } from "@corelithzw/shell/app-sidebar";\n',
         '''import { Navbar } from "@corelithzw/shell/navbar";
import { AppSidebar } from "@corelithzw/shell/app-sidebar";
import type { SidebarModelArgs } from "@corelithzw/shell/sidebar-model";
import { GlobalCommandBar } from "@/components/layout/command-bar/global-command-bar";
import { CrmMembers } from "@/components/crm/crm-members";
import { SidebarCrmCollections } from "@/components/crm/sidebar-crm-collections";
import { NotificationCenter } from "@corelithzw/module-notifications/components/notification-center";
import { OfflineStatusButton } from "@corelithzw/module-offline/components/offline-status-button";
import { fetchStockLocations } from "@corelithzw/module-stock/api-client";
import { canAccessCapabilityWithToken, hasTokenFeature } from "@corelithzw/platform/gating/token-check";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
''', 1),
        ('''  const pathname = usePathname();
  const isAuthRoute = pathname === "/login";
''', '''  const pathname = usePathname();
  const { data: session } = useSession();
  const enabledFeatures = (session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures;
  // Which stock surfaces are worth offering depends on how the stock is laid
  // out, and that is a fact about the tenant rather than about its plan — a
  // transfer needs two active locations at one site before it has anywhere to
  // go. Only asked for where a stock surface could appear at all.
  const stockLocationsQuery = useQuery({
    queryKey: ["stock-locations", "active"],
    queryFn: () => fetchStockLocations({ active: true, limit: 200 }),
    enabled: hasTokenFeature(enabledFeatures, "stores.inventory"),
    staleTime: 5 * 60_000,
  });
  const activeStockLocationSiteIds = React.useMemo(
    () => stockLocationsQuery.data?.data.map((location) => location.siteId),
    [stockLocationsQuery.data],
  );
  const resolveSidebarModel = React.useCallback(
    (args: SidebarModelArgs) => getWorkspaceSidebarModel({ ...args, activeStockLocationSiteIds }),
    [activeStockLocationSiteIds],
  );
  const showNotificationCenter = canAccessCapabilityWithToken(
    "notification.center.widget",
    enabledFeatures,
  ).allowed;
  // The CRM is the one module that is genuinely a shared book, so it is the
  // one that shows you who else is in it.
  const showMembers = pathname === "/crm" || pathname.startsWith("/crm/");
  const isAuthRoute = pathname === "/login";
''', 1),
        ('        <AppSidebar />\n', '        <AppSidebar resolveModel={resolveSidebarModel} collections={<SidebarCrmCollections />} />\n', 1),
        ('          <Navbar />\n', '''          <Navbar
            members={showMembers ? <CrmMembers className="mr-1" /> : null}
            tools={
              <>
                <GlobalCommandBar />
                <OfflineStatusButton />
                {showNotificationCenter ? <NotificationCenter /> : null}
              </>
            }
          />
''', 1),
    ])
    # the host's command palette composition imports the shell's palette by package path
    p=f"{APP}/components/layout/command-bar/global-command-bar.tsx"
    edit(p, [('from "./command-bar"', 'from "@corelithzw/shell/command-bar/command-bar"', 1),
             ('from "./command-bar-types"', 'from "@corelithzw/shell/command-bar/command-bar-types"', 1)])
    print("seams done")

if want("check"):
    left=[]
    for p in walk(SH):
        if re.search(r'["\']@/', open(p).read()) or re.search(r'["\']@corelithzw/module-', open(p).read()): left.append(os.path.relpath(p, SH))
    print("shell files importing '@/' or a module:", left or "none")
