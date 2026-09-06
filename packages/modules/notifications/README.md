# @corelithzw/module-notifications

Who is told what, and what they can do about it.

```
service.ts                       createNotification, recipient filtering by preference, the actions a notice offers
api-client.ts                    the browser's client for /api/notifications, and the list item types
components/notification-center   the bell and the list
components/notification-renderers
hooks/use-notification-stream    the server-sent stream
manifest.ts                      id "notifications"; requires nothing
```

Import by path: `import { createNotification } from "@corelithzw/module-notifications/service"`.

The service names no module. Where a notice about a payroll run opens, and what
an approver may do from it, is data in the payroll module's manifest
(`notifications.viewPaths`, `notifications.approvalActions`); the service reads
the registered manifests. The emitters that know those entities live with their
modules — until a module is extracted, in the host's `lib/notifications.ts`.
