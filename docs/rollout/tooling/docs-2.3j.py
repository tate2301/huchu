p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3i (gold) executed:"
row=("| 2026-09-06 | — | **Phase 2.3j executed: the app shell in `packages/shell`.** The sidebar and its parts, the navbar, the command "
     "palette and its types, the breadcrumbs, the guided-mode toggle, the session and appearance providers and the login forms moved to "
     "`@corelithzw/shell`. The plan said slots registered from `modules.client.ts`; the refinement is that a slot is a prop, filled by the "
     "host's own composition file: `apps/legacy/components/layout/app-shell.tsx` stays in the host and renders the shell's `AppSidebar` with "
     "`resolveModel` (the host's `getWorkspaceSidebarModel`, with the stock-locations query that feeds it) and `collections` (the CRM's "
     "shelves), and the shell's `Navbar` with `tools` (the command palette, the offline status button, the notification centre) and `members` "
     "(the CRM's members on its routes). Registries are for what is read outside React; a React element is passed as a React element. The "
     "sidebar model's shapes live with the sidebar (`shell/sidebar-model.ts`) and the host's resolver implements them; the shell's navigation "
     "types carry the hosts' names too, so `lib/navigation.ts` re-exports them rather than keeping a copy. The global command palette and the "
     "record previews stay in the host: they name records and the CRM's appointments, and the host passes the palette into the navbar's "
     "tools. `app-providers.tsx` stays for the same reason; the generic providers it composes moved. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
p="/home/user/huchu/AGENTS.md"; s=open(p).read()
old="The host registers its navigation model there on every side (`manifests.ts`); the app shell itself (sidebar, navbar, command bar) is still the host's until the manifests carry navigation."
assert s.count(old)==1
new=("The host registers its navigation model there on every side (`manifests.ts`). The app shell lives there too — `@corelithzw/shell/app-sidebar`, `@corelithzw/shell/navbar`, the command palette, breadcrumbs, the session and appearance providers, the login forms — with slots as props: the host's `components/layout/app-shell.tsx` renders them and passes what names a module (the sidebar model resolver, the CRM's shelves, the navbar's tools and members). The shell never imports a module.")
open(p,"w").write(s.replace(old,new)); print("docs 2.3j applied")
