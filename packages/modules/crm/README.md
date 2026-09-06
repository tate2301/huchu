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
```

Import by path: `import { movePipelineStage } from "@corelithzw/module-crm/pipeline"`.

The API routes, the pages and the public token pages stay in the host until
the CRM host composes this module.
