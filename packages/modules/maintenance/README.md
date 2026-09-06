# @corelithzw/module-maintenance

Maintenance: work orders, equipment, breakdowns and the schedule. An add-on.

```
api-client.ts   the browser's client
components/     the screens
manifest.ts     id "maintenance"; requires ["stock", "people", "documents"]
```

The API routes, the notification emitters and the pages stay in the host until
the first product host composes this module.
