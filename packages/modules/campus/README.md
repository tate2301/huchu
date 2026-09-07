# @corelithzw/module-campus

The school: students and guardians, admissions, classes and subjects, the
timetable, attendance, assessments and results, fees, boarding, transport,
the library, and the parent, student and teacher portals.

```
*-v2.ts, *.ts       the domain, one file per concern, with its browser client beside it
import/             the CSV import pipeline on the kernel's import-core
fees-posting.ts     how a fee invoice, receipt or write-off posts to the books
document-sources.ts the school's document sources, registered by the host
record-types.ts     the school's record types, declared in the manifest
components/         the screens, the portals, the master-data panels
api/                the route handlers (v2/schools, v2/portal, public/schools), on the paths a host serves them at
pages/              the pages and layouts (schools, the three portals, the claim page c/[token])
manifest.ts         id "schools"; requires records, documents, books, offline, people, notifications
```

Import by path: `import { listStudents } from "@corelithzw/module-campus/students-v2"`.

A host composes the routes and pages with `pnpm compose <host dir> campus`
(`scripts/compose-host.mjs`), which writes a one-line re-export for each into
the host's `app/` tree. Routes and pages read the session through the kernel
(`getCurrentAuthSession`), never a host's auth config. The manifest id stays
`schools`, the schema's name for it.
