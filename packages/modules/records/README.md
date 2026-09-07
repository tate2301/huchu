# @corelithzw/module-records

What every record in the product has in common, whichever module owns it.

```
registry.ts        the record types the registered manifests declare, as the functions the screens call
subject.ts         the subject of a task, comment or file: (type, id) across modules
search.ts          one search across the arms the host registered (registerSearchArm)
search-result.ts   the shared result shape, grouping and labels
custom-fields.ts   custom-field definitions and values; the field-definition API shape
record-ref.ts      parsing a record's href back into a reference
components/        record page shell, mark, attributes, table, peek, trail, entity link, …
manifest.ts        id "records"; requires nothing
api/               the route handlers, on the paths a host serves them at
```

Import by path: `import { recordType } from "@corelithzw/module-records/registry"`.

The module names no other module. A module with records declares them in its
manifest (`records.types`, templates with `{id}`); the host wires each module's
search arm in its `modules.ts`. The vocabulary of types is the schema's
`CrmFieldEntity` enum, which modules extend in their own schema files.
