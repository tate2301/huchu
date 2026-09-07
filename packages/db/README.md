# @corelithzw/db

The database, owned by one package: the Prisma schema, the migration history,
the Prisma config and the client every host and module uses.

```
prisma/schema/        one .prisma file per module (platform, auth, people, books, stock,
                      records, documents, notifications, maintenance, compliance, sell,
                      crm, campus, gold); schema.prisma holds the datasource and generator
prisma/migrations/    one history for the whole platform; expand-first
prisma.config.ts      schema and migration paths, datasource from DATABASE_URL
src/client.ts         the PrismaClient singleton (pg pool + driver adapter): @corelithzw/db/client
src/index.ts          everything `@prisma/client` exports — types, enums, Prisma: @corelithzw/db
```

Import the client and the generated types from here:

```ts
import { Prisma, UserRole, type Company } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
```

## Commands

Run from the repository root; each delegates to this package.

| Command | What it does |
|---|---|
| `pnpm db:generate` | Generate the client. Also runs before every `build`, `dev`, `test` and `typecheck` through Turborepo. |
| `pnpm db:validate` | Validate the multi-file schema. |
| `pnpm db:migrate:dev` | Create a migration from a schema change (development database). |
| `pnpm db:migrate:status` | Show applied and pending migrations for `DATABASE_URL`. |
| `pnpm db:migrate:deploy` | Apply pending migrations. Production runs this from the database release workflow, never from a host's build. |
| `pnpm db:check:drift` | Against a scratch database: apply every migration, then prove the result matches `prisma/schema/`. CI runs it on every pull request. |
| `pnpm db:check:deps` | Fail if any other workspace package declares `@prisma/client` or `prisma` (see below). |
| `pnpm db:push` | Push the schema to a throwaway local database. Never against a shared database. |
| `pnpm db:studio` | Prisma Studio. |

`DATABASE_URL` comes from the environment, from `packages/db/.env`, or from the
repository-root `.env` — in that order of precedence.

## Two entrypoints, and why only this package depends on `@prisma/client`

- `@corelithzw/db` — the generated types, the `Prisma` namespace and every enum.
  Safe anywhere, client components included: a bundler resolves it to Prisma's
  browser build.
- `@corelithzw/db/client` — the `prisma` singleton with its `pg` pool. Server code
  only. A client component that imports it, even indirectly, fails the build
  (`pg` needs `dns`), which is the same rule `lib/prisma.ts` lived under.

`prisma-client-js` generates into the installed `@prisma/client` package, and
pnpm keys an installed package by the peer dependencies seen from each
dependent (`prisma` carries React peers through Prisma Studio). Two workspace
packages declaring `@prisma/client` would therefore get two physical copies,
and `prisma generate` fills exactly one. So this package is the only one that
declares it, generates into it, and re-exports it; everything else imports
from `@corelithzw/db`. `pnpm db:check:deps` fails the build if another
`package.json` in the workspace adds `@prisma/client` or `prisma`.

## Adding a table

Put the model in the module's file. A module writes another module's tables only
through that module's public entrypoint (see the layering rules in
`docs/rollout/product-split-plan.md`). Then `pnpm db:migrate:dev --name <change>`,
commit the migration with the schema change, and ship expand-first: six hosts
deploy against this one database, so a column is dropped only after every host
that read it has shipped without it.
