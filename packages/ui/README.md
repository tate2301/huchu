# @corelithzw/ui

The design-system layer every host and module renders with: wrappers around
`@corelithzw/react`, charts, icons, a few hooks and the `cn` helper. It knows
nothing about tenants, modules or the database, and it must stay that way — it
is the bottom of the UI stack (`ui ─── platform ─── db`).

```
components/   what was components/ui (button, dialog, data-table, …) and the person avatar
charts/       what was components/charts
corelith/     what was components/corelith
layout/       the page chrome every screen is built from: page-chrome, page-heading, page-actions, list- and detail-page-shell
shared/       status-state, form-shell, page-intro, field-help, context-help, record-saved-banner, data-list-shell, primary-action-bar
lib/          utils (cn), icons, ui/* (accents, status maps, view icons), animation, charts, table-export, saved-record
hooks/        use-debounced, use-mobile, use-guided-mode
```

The chrome that knows about roles and features — the module shell and the
navigation registry — is `packages/shell`, which depends on this package and
on `platform`; this package depends on nothing in the workspace. The app shell
itself — sidebar, navbar, command bar, breadcrumbs — is still the host's
(`apps/enterprise/components/layout`) until the manifests carry navigation.

Import by path: `import { Button } from "@corelithzw/ui/components/button"`,
`import { cn } from "@corelithzw/ui/lib/utils"`, `import { Cube } from "@corelithzw/ui/lib/icons"`.

`DataTable` exports through a `TableExporter` the host provides
(`TableExportProvider`); without one the export menu stays hidden. The
Documents module supplies the real one, so this package never imports upward.
