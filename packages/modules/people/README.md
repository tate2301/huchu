# @corelithzw/module-people

Employees, leave, attendance, payroll runs, statutory tables and returns,
disbursements, compensation and disciplinary actions.

```
hr/            permissions, bootstrap, the payroll engine and its posting, statutory packs, returns, the payslip source
people/        attendance, leave, search, the tabs
payroll/       disbursements, the tabs
payroll-periods.ts
api-client.ts  the browser's client for the people endpoints
directory.ts   what another module may read: the search arm and the linkable users
components/    the people and payroll shells, the employee wizard, leave, statutory screens
manifest.ts    id "people"; requires books, workflow, documents, records
```

Import by path: `import { hrPermissionDenial } from "@corelithzw/module-people/hr/permissions"`.

Other modules read people through `@corelithzw/module-people/directory` and
nothing else of this module.
