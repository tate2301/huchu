# @corelithzw/module-offline

What keeps the till and the workforce screens working without a network.

```
runtime, lifecycle-machine, session-*, tenant-context, bootstrap-state   the offline session
db, db-v2, entity-store, outbox, query-cache, attachment-store, client-storage   what is kept locally
sync-engine, module-registry, conflict-resolver                           syncing the outbox through the modules' adapters
workflow-catalog                                                          which screens work offline, for whom
service-worker/sw.ts                                                      the worker source (built into the host's public/sw.js)
components/                                                               the provider, banner, keypad, sync panel, badges
hooks/use-offline-connectivity
manifest.ts                                                               id "offline"; requires nothing
```

The module names no other module. The definitions — which routes to warm,
which queries to preload, how to sync a held sale — and the workflow
catalogue are registered by the host on both sides (`modules.client.ts`),
and move into the modules that own the screens as their manifests grow.
