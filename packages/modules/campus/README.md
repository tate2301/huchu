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
manifest.ts         id "schools"; requires records, documents, books, offline, people, notifications
```

Import by path: `import { listStudents } from "@corelithzw/module-campus/students-v2"`.

The API routes and the pages stay in the host until the Campus host composes
this module; the manifest id stays `schools`, the schema's name for it.
