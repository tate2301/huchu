# @corelithzw/module-compliance

Compliance: permits, inspections, incidents and training records. An add-on.

```
api-client.ts   the browser's client
components/     the screens
manifest.ts     id "compliance"; requires people, documents, notifications
api/            the route handlers, on the paths a host serves them at
pages/          the pages and layouts, on the paths a host serves them at
```

A host composes the routes and pages with `pnpm compose <host dir> compliance`.
