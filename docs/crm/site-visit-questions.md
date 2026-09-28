# Site visit questions

What a rep is asked when they get to an address, and how a tenant changes it.

Shipped 22 Sep 2026 (PR #173). This supersedes the "no migration, no UI
written" note in [`site-visit-schema-proposal.md`](./site-visit-schema-proposal.md),
which is kept for the reasoning that led here.

---

## The shape

A visit opens a **section** per thing being quoted. A rep pricing an epoxy
floor *and* a branded entrance mat is on one visit to one address, so the
products are sections of that visit rather than two visits. Each section asks
that product's own questions; nobody scrolls past 152 to find the eleven that
apply.

| Table | Holds |
| --- | --- |
| `CrmQuestionSet` | A section. Optionally attached to a `Product`. |
| `CrmQuestion` | One question: key, label, type, options, unit, flags. |
| `CrmSiteVisitSection` | A section opened on a particular visit. |
| `CrmSiteVisitAnswer` | One answer, with the question snapshotted. |
| `CrmSiteVisitPhoto` | A photograph, hanging off an answer. |

**Answers are rows, not JSON.** A photograph needs a foreign key to the
question it evidences, and *"which sites showed damp?"* should be an indexed
lookup rather than a scan of every visit ever recorded. The value lands in one
of `valueText` / `valueNumber` / `valueBool` / `valueOptions` / `valueDate` /
`valueJson`, chosen by the question's type — see `valueColumnsFor` in
`lib/crm/site-visits/answers.ts`.

Every answer **snapshots** `questionKey`, `questionLabel` and `questionType` at
capture. Archive a question a year later and last year's report still reads
exactly as the rep filled it in.

### Question types

`SHORT_TEXT`, `LONG_TEXT`, `NUMBER`, `BOOLEAN`, `SINGLE_SELECT`,
`MULTI_SELECT`, `DATE`, `DIMENSION` (width × height), `PHOTO_EVIDENCE`.

`SINGLE_SELECT` and `MULTI_SELECT` are meaningless without choices, so the
editor and the server both refuse to save one with an empty list.

## Where the questions come from

Templates in code seed a tenant's rows **once**, the same arrangement
`ensureDefaultPipeline` uses for pipelines.

| Template key | What it is |
| --- | --- |
| `floorcode-flooring-v1` | FloorCode's own bank: 152 questions, 13 sections, generated from their `.docx`. `lib/crm/site-visits/floorcode-question-bank.ts`. |
| `generic-v1` | The eight items `DEFAULT_SITE_VISIT_CHECKLIST` always shipped, so a tenant who is not FloorCode keeps the visit they had. |

`Company.siteVisitTemplateKey` decides which. Null means generic. An
unrecognised key falls back to generic rather than throwing — a typo in a
settings field should not take the visit page down.

> [!IMPORTANT]
> **Seeding happens once and never again.** `ensureSiteVisitQuestionSets`
> returns early if the tenant has any sections at all
> (`if (existing.length > 0) return existing`). That guard is what stops a
> re-seed trampling questions somebody has edited — and it means the order of
> a rollout matters, with no second chance. See **Rolling this out** below.

## Editing

**CRM settings → Site visit questions**, at `/crm/settings/site-visit-questions`.
Reading is open to anyone who can see the CRM; writing is gated on
`settings.manage`.

The screen shares `FieldRow` (`components/crm/field-editor/field-row.tsx`) with
the intake form builder. The two ask for the same things — a key, a label, a
type, a list of choices — and should not drift into two ideas of what a field
is. They deliberately **do not** share storage: intake fields are a JSON blob
on `CrmIntakeForm`; these are rows with foreign keys pointing at them.

Two rules are enforced in `lib/crm/site-visits/question-editing.ts`, on the
server rather than by a disabled input:

- **A key is immutable once saved.** Answers are stored against it and the
  section upsert is keyed `(sectionId, questionKey)`. Renaming orphans every
  answer already given and makes the next offline replay create a duplicate
  instead of updating. Wanting a different key is wanting a different
  question: archive and add.
- **A question dropped after somebody answered it is archived, never
  deleted.** The answer keeps its own label snapshot either way, but the
  definition is the only place the help text and full choice list survive.

Saving a section clears its `sourceTemplateKey`. From then on the tenant owns
those questions and no template will touch them.

### needsReview

25 of the imported questions had their type guessed by the generator — they
are yes/no questions in the document that list alternatives. They carry
`needsReview: true`, the editor says so, and saving the section clears the
flag. Advisory only; it never blocks capture.

## Rolling this out

The tables are created by migration; the questions are seeded lazily on first
read. Neither happens at deploy time.

```bash
npx prisma migrate deploy

# Dry run — prints what it will do and writes nothing
npx tsx scripts/set-site-visit-template.ts --company=<slug> --template=floorcode-flooring-v1
# Then, when the output looks right
npx tsx scripts/set-site-visit-template.ts --company=<slug> --template=floorcode-flooring-v1 --apply
```

Seeding then happens on the next read — a rep opening a visit, or anyone
opening the settings screen.

**Why a script and not one `UPDATE`.** Because of the seed-once guard: if
anyone opens a visit after the migration but before the key is set, that
tenant holds the eight generic items permanently and a later `UPDATE` does
nothing at all. The script handles all three states:

| Tenant state | What it does |
| --- | --- |
| Nothing seeded | Sets the key. The next read seeds correctly. |
| Generic seed, untouched | Sets the key, drops the generic sections, re-seeds. |
| Anything answered or edited | Sets the key, touches nothing else, says why. |

The third is not a failure. Questions that have been answered or edited are
somebody's work; changing them belongs in the settings screen, one at a time,
in front of a person who can see what they are changing.

## The bug this fixed

Worth recording, because the test suite was green throughout.

`questionSetsForVisit` calls `ensureSiteVisitQuestionSets(tx, companyId)` with
no template key, and that argument used to default to `generic-v1`. The only
caller that ever passed `floorcode-flooring-v1` was the seeding test itself.
FloorCode would have been seeded the same eight generic items they complained
about, and every test still passed — because each one handed the function the
answer and so proved only that the function worked.

The tests now seed through `questionSetsForVisit`, the call the route actually
makes. Reverting the one-line fix turns ten of them red, led by
`expected 8 to be 152`.

**The lesson worth keeping:** a test that supplies the parameter under test
proves the unit, not the wiring. Where a default decides behaviour, exercise
the call site.

## Files

| | |
| --- | --- |
| `lib/crm/site-visits/question-sets.ts` | Templates, seeding, product matching |
| `lib/crm/site-visits/question-editing.ts` | Write side: validation, key immutability, archive-not-delete |
| `lib/crm/site-visits/answers.ts` | Value columns, saving, progress |
| `lib/crm/site-visits/floorcode-question-bank.ts` | The generated bank |
| `app/api/v2/crm/question-sets/` | Settings CRUD |
| `app/api/v2/crm/appointments/[id]/sections/` | Capture |
| `components/crm/settings/question-sets-content.tsx` | The editor |
| `components/crm/visits/visit-question-sections.tsx` | Capture UI |
| `scripts/set-site-visit-template.ts` | Rollout |
