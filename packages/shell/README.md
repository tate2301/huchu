# @corelithzw/shell

The workspace chrome that knows about roles and features — what `ui` may not
know, because `ui` depends on nothing in the workspace.

```
navigation.ts     the navigation registry the hosts fill at boot, and the role filter
sidebar-model.ts  what the sidebar renders; a host resolves it from the person's role, features and profile
app-sidebar.tsx, app-sidebar/   the sidebar: account menu, quick actions, sections, a collections slot, support
navbar.tsx        the app bar: title and icon from the registry, a tools slot and a members slot
command-bar/      the command palette and its types (the host composes what it searches)
breadcrumbs.tsx, guided-mode-toggle.tsx
providers/        the session and appearance providers
auth/             the login forms and the role gate
module-shell.tsx  the category rail and page band every module's screens sit in
management.ts     the Management area's registry (modules, areas, labels) and its helpers
management-shell, master-data-page, master-data-shell   the Management chrome and the master-data pattern
```

Import by path: `import { ModuleShell } from "@corelithzw/shell/module-shell"`.

Depends on `ui` and `platform`; a module depends on it for its shell, and the
shell never imports a module. Where the chrome needs something a module owns it
takes a slot: the host's `components/layout/app-shell.tsx` renders `AppSidebar`
with `resolveModel` and `collections`, and `Navbar` with `tools` and `members`,
passing React elements as React elements. The global command palette, which
searches records, stays with the host and is passed in as a tool.
