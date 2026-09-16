# Boarding

The house: where there is a free bed, who is in which bed, who is in the
building tonight, who is ill, and who is out of the gate.

## Why it is shaped this way

**You go to a house first.** A boarding school is not one estate with beds in
it. It is four or five houses, each with a warden who runs it, its own roll and
its own problems. Nobody does boarding work "across the school" — they do it in
Nyanga, then in Inyanga. The landing page is the houses; everything else is
reached through one.

**A dormitory is not a hotel room.** Thirty-two beds down two walls with an
aisle between them is the normal case, so `dormitory-plan.tsx` draws a room as
its two wall runs, a bay per bunk, upper and lower stacked. Drawing it as a
grid of four-bed cards loses the thing a warden is actually reading.

**One drawing, two sizes, and the size follows the scope.** *All dormitories*
renders the same plan small with the text removed; *one dormitory* renders it
full size with initials, bay numbers and tier letters. It is the same picture,
not a second representation — which is what lets a house of four dormitories
and a school of forty read the same way, and what lets you see *which end of
the room* is empty.

**A free bed is a thing, not an absence.** A list of allocations tells you who
is in the house and never where there is space. Everything here is built from
beds outward.

## The rules, and where they live

`lib/schools/boarding-rules.ts` is pure and has no database behind it, so the
screen can grey out the beds a child cannot have before anybody clicks, and so
the rules have one definition rather than one in the handler and another in the
UI.

`bedRefusal()` returns **a sentence, not a boolean**. "Nyanga House takes boys
only" tells a warden they picked the wrong house; "not eligible" tells them
nothing. The screen shows that sentence when somebody presses a dimmed bed.

| Rule | Why |
|---|---|
| Out of service is refused, not filtered | One place decides whether a bed can take a child. A broken bed that merely looks empty is the one a child gets assigned to. |
| A blank gender is refused from a single-sex house | One empty field must not be the thing that puts a boy in a girls' dormitory. |
| A prefects' dormitory takes prefects | The school enforces this socially; the placer should not quietly break it. |

`bedScore()` orders the beds that pass. The weights are a warden's, not an
optimiser's: the right year group dominates, then year-mates, then the emptier
house (so intake spreads instead of filling one house to the roof), then a
lower bunk as the tiebreak.

## Roll call

**The register is recorded.** Before this it was a checklist somebody ticked
and threw away, which is not a roll call — the point is answering "who said
this child was in the building on Tuesday night" three weeks later.

A session is scoped to a house and unique on `(house, night, session)`, so two
wardens at two desks cannot produce two registers that disagree. Opening the
screen twice returns the same session.

**A child the school already knows is away opens accounted for.** `SIGNED_OUT`
and `SICK_BAY` are seeded when the session opens, from the gate book and the
sick bay. Making a warden tick past them is how the count becomes a ritual
instead of a check — and it is why `NOT_SEEN` can mean exactly one thing:
nobody has looked yet.

Those statuses are **written down rather than computed at read time**. A leave
record can be edited or cancelled afterwards, and the register has to keep
saying what was true that night.

`ABSENT` does not block submission. A child who has been looked for and not
found is an answer — a bad one that starts a phone call, but the warden has
given it. `NOT_SEEN` blocks, because submitting it would record "we checked"
when nobody did.

## The sick bay holds a boarder's own bed

Deliberately **not** an allocation. Modelling the sick bay as another house and
moving the child into it would free their real bed, and the placer would hand
it to somebody else while its owner is two doors away with a temperature.

`SchoolSickBayAdmission` is a lighter second record saying: not in their bed
tonight, and the bed is not available. There is a migration witness test
asserting the allocation stays `ACTIVE` across an admission.

## Term rollover

`lib/schools/boarding-rollover.ts`. Without it, the first day of Term 2 is an
empty bed board and a warden retyping two hundred children by hand — the point
at which a school stops using the system and goes back to the paper plan on the
office wall.

- **Closing** a term ENDs every active allocation. `ENDED`, never deleted:
  "who slept in bed 12 last October" is a safeguarding question, and a school
  that answers it with a shrug because the rows were tidied away has a problem.
  The beds come free because free is computed from ACTIVE allocations, not from
  the absence of a row.
- **Opening** a term gives every returning boarder their bed back.

**Both preview before they write.** `planRollover()` returns `carriedOver` /
`needsPlacing` / `notReturning` and writes nothing; the warden commits. A mass
allocation nobody saw before it ran is how a school loses a term of data.

Carrying over deliberately refuses to be clever. A child whose bed is now out
of service, or whose house no longer takes their sex after a reorganisation,
comes back as `needsPlacing` rather than being quietly moved somewhere else.
That is a short list and a decision a person should make.

## Nothing bulk is written until it is committed

Single edits apply at once with an Undo in the toast. A mass fill batches into
a pending set the warden reviews first. The two behaviours are different on
purpose: undoing one placement is easy, and undoing a hundred is not.

## Files

| What | Where |
|---|---|
| Placement rules, scoring | `lib/schools/boarding-rules.ts` |
| Roll-call logic | `lib/schools/boarding-roll-call.ts` |
| Term rollover | `lib/schools/boarding-rollover.ts` |
| Allocation service | `lib/schools/boarding.ts` |
| Screens | `components/schools/boarding/` |
| Routes | `app/api/v2/schools/boarding/` |
| Migration | `prisma/migrations/20260916140000_boarding_roll_call_sick_bay/` |

## Tests

```bash
pnpm test lib/schools/boarding-placement.test.ts   # pure rules, no database
pnpm test lib/schools/boarding-roll-call.db.test.ts  # migration witness
```

The witness tests insert **past the service layer** on purpose: an application
check cannot survive two wardens at two desks pressing the same button on a
slow connection, and a unique index can. Each one names the accident it stands
in the way of.

### If the witness tests cannot find their tables

The test database was stood up with `db:push` and has no `_prisma_migrations`
history, so `prisma migrate deploy` replays the whole log from the beginning
and dies on the first table that already exists. That is pre-existing and not
fixed here. To catch a database up with one migration:

```bash
node scripts/apply-migration-sql.mjs 20260916140000_boarding_roll_call_sick_bay
```
