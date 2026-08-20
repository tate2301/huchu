# Recovered, 2026-08-20

This migration was applied to the shared development database on 2026-08-17 and
its file was never committed. `prisma migrate status` reported it for three days
as:

```
The migration from the database are not found locally in prisma/migrations:
20260818090000_retail_sale_client_operation_id
```

which is the state `migrate deploy` refuses to run against — so the three
genuinely pending migrations behind it could not be applied either.

It was written in an agent worktree — `.claude/worktrees/gracious-euclid-c8e331`
— applied from there, and the worktree was never merged. `migration.sql` here is
that file, byte for byte: its SHA-256 is
`8802e9705d738e865baa679ecbde7ef77b0d40e25bae033f7ddd6a7863785ac4`, which is the
checksum `_prisma_migrations` recorded when it ran. Restoring it therefore
reconciles the history truthfully — no row was edited, nothing was marked
rolled-back, and no `--force` was involved.

**Do not edit `migration.sql`.** Prisma checksums that file and compares it to
the recorded value on every command; a single changed byte turns a resolved
history back into a failure, and one that is harder to diagnose than the original
because the migration now exists. This README is separate precisely so the
explanation can live here without touching it.

## Half of it is superseded, and half is still load-bearing

The name only describes the first half.

**`RetailSale.clientOperationId` is dead.** It was an attempt at the till's
idempotency key — the thing that stops a bad line double-charging a customer when
a POST lands and the response does not. S-7.7 solved the same problem with
`clientRef` a day later, without knowing this column existed, and `clientRef` is
what the code writes. `clientOperationId` is not in `prisma/schema.prisma`, so
Prisma cannot write it, and it is null on all 5,102 sale rows. The name
`clientOperationId` does still appear in `app/api/v2/retail/pos/sync/route.ts`,
54 times — but as a **wire field** correlating an operation in a sync batch to
its result. It never reaches a column. Dropping the column is a separate,
deliberate change; see the note in the retail hardening plan.

**The `IdSequence` seeding is not dead, and matters.** The till used to mint its
own sale numbers — `RSL-1787005374335700`, a timestamp with three random digits.
`reserveIdentifier` seeds a scope's counter from the highest existing code, and
that number parses to 1.7e15, which does not fit `IdSequence.lastNumber`
(INTEGER). Any shop that had rung up a POS sale but never reserved a retail-sale
identifier would have hit **integer out of range** on its first refund, because
refunds allocate through the same path. The `INSERT … ON CONFLICT DO NOTHING`
below seeds every scope that has sales, counting only well-formed codes.

That fix exists nowhere else in the repository. Had the orphan been resolved by
deleting the `_prisma_migrations` row — the other obvious way out — the next
database built from migrations would have shipped without it.
