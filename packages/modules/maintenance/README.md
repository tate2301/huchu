# @corelithzw/module-maintenance

Maintenance: work orders, equipment, breakdowns and the schedule. An add-on.

```
api-client.ts   the browser's client
components/     the screens
manifest.ts     id "maintenance"; requires stock, people, documents, notifications, books
api/            the route handlers, on the paths a host serves them at
pages/          the pages and layouts, on the paths a host serves them at
```

A host composes the routes and pages with `pnpm compose <host dir> maintenance`.
