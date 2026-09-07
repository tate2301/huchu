import re
p="/home/user/huchu/README.md"; s=open(p).read()
old_row=[l for l in s.split("\n") if l.startswith("| `packages/config/` |")][0]
new_row=old_row+"\n| `packages/shell/` | The workspace chrome that knows about roles and features: the navigation registry the host fills, and the module shell every module's screens sit in. Depends on `ui` and `platform`. Import by path: `@corelithzw/shell/module-shell`. |"
assert s.count(old_row)==1; s=s.replace(old_row,new_row); open(p,"w").write(s)
p="/home/user/huchu/AGENTS.md"; s=open(p).read()
old_line=[l for l in s.split("\n") if l.startswith("- `packages/platform/` is the kernel")][0]
new_line=old_line+"\n- `packages/shell/` is the workspace chrome that knows about roles and features (`@corelithzw/shell/module-shell`, `@corelithzw/shell/navigation`): it depends on `ui` and `platform`, and a module depends on it for its shell. The host registers its navigation model there on every side (`manifests.ts`); the app shell itself (sidebar, navbar, command bar) is still the host's until the manifests carry navigation."
assert s.count(old_line)==1; s=s.replace(old_line,new_line); open(p,"w").write(s)
p="/home/user/huchu/packages/ui/README.md"; s=open(p).read()
old="""The app shell itself — sidebar, navbar, command bar, breadcrumbs — is still the
host's (`apps/legacy/components/layout`): it names modules, and moves here once
the manifests carry navigation and the shell reads it from a registry."""
new="""The chrome that knows about roles and features — the module shell and the
navigation registry — is `packages/shell`, which depends on this package and
on `platform`; this package depends on nothing in the workspace. The app shell
itself — sidebar, navbar, command bar, breadcrumbs — is still the host's
(`apps/legacy/components/layout`) until the manifests carry navigation."""
assert s.count(old)==1; s=s.replace(old,new); open(p,"w").write(s)
p="/home/user/huchu/docs/rollout/product-split-plan.md"; s=open(p).read()
anchor="| 2026-09-06 | — | **Phase 2.3e executed:"
row=("| 2026-09-06 | — | **Phase 2.3f executed: `packages/shell`.** A refinement of the layering: the plan put the app shell in `ui`, but `ui` depends on "
     "nothing in the workspace and the module shell reads roles and features from the kernel. So the chrome that knows about roles and features is its "
     "own package, `@corelithzw/shell`, depending on `ui` and `platform`: the navigation registry the host fills on every side (`manifests.ts`, so the "
     "browser and the server read the same sections) with the role filter, and `ModuleShell` out of `components/shared` — the rail every module's "
     "screens sit in, which the people, payroll and accounting shells import from the package. The navigation model itself (`lib/navigation.ts`) "
     "stays the host's data until the manifests carry navigation; the sidebar, navbar and command bar follow in 2.3j. The Management area's chrome came with it — the management shell, the master-data page and shell, and a registry for the management navigation (modules, areas, labels) the host fills the same way — because the compliance and maintenance screens sit inside it. |\n")
assert s.count(anchor)==1; open(p,"w").write(s.replace(anchor,row+anchor))
print("docs 2.3f applied")
