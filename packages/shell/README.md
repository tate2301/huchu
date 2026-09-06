# @corelithzw/shell

The workspace chrome that knows about roles and features — what `ui` may not
know, because `ui` depends on nothing in the workspace.

```
navigation.ts     the navigation registry the hosts fill at boot, and the role filter
module-shell.tsx  the category rail and page band every module's screens sit in
management.ts     the Management area's registry (modules, areas, labels) and its helpers
management-shell, master-data-page, master-data-shell   the Management chrome and the master-data pattern
```

Import by path: `import { ModuleShell } from "@corelithzw/shell/module-shell"`.

Depends on `ui` and `platform`; a module depends on it for its shell. The app
shell itself — sidebar, navbar, command bar — arrives here from the host once
the manifests carry navigation and the shell reads it from the registry.
