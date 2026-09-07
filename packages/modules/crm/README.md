# @corelithzw/module-crm

Leads, people, companies, sites and deals; pipelines, tasks and appointments;
quotes and work orders; intake forms, site visits and sign-off; automation,
lead scoring, commissions; the collaboration layer and the collections a
person keeps to hand.

```
*.ts               the domain, one file per concern
crm-v2.ts, collections-client.ts   the browser's clients
capabilities.ts    what the CRM lets a person do, declared in the manifest
notifications.ts   the CRM's notices, on the notifications service
components/        the screens: records, leads, pipelines, tasks, visits, work orders, reps, settings, the public pages
manifest.ts        id "crm"; requires records, documents, books, stock, notifications
api/               the route handlers, on the paths a host serves them at
pages/             the pages and layouts, on the paths a host serves them at
```

Import by path: `import { movePipelineStage } from "@corelithzw/module-crm/pipeline"`.

A host composes the routes, the pages and the public token pages with
`pnpm compose <host dir> crm`.
