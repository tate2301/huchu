# @corelithzw/module-documents

One render pipeline for everything the product prints.

```
service.ts                   render a document: resolve the source, pick the template, brand it, produce PDF/HTML/CSV
source-registry.ts           the universal payload, and the sources the host registered (registerDocumentSource)
template-schema.ts           what a template can say about page, header, table, footer and labels
default-template-catalog.ts  the module's own default plus what the manifests declare (documents.templates)
template-resolver.ts         which template applies: the tenant's, else the default
branding-snapshot.ts         the tenant's letterhead at render time
html-renderer.ts, pdf-renderer.ts, csv-renderer.ts
export-client.ts, table-exporter.ts, pdf.ts    the browser side: request a render, poll, download; the DataTable exporter
blocks.ts, starter-templates.ts, template-variables.ts   block templates (quotes, forms, invoices), starters, {{variables}}
components/templates/        the block editor, renderer, public form, analytics, variable picker
components/template-library  the template library screen
components/pdf/              the PDF viewer
manifest.ts                  id "documents"; requires records
api/                         the route handlers, on the paths a host serves them at
pages/                       the pages and layouts, on the paths a host serves them at
```

Import by path: `import { renderDocument } from "@corelithzw/module-documents/service"`.

The module names no other module. A module with printable records registers a
source from the host's `modules.ts` and declares its default templates in its
manifest; the school, payroll, accounting and report sources live in the host
until their modules move.
