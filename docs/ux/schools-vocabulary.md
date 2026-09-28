# The words a Zimbabwean school uses

The admin dashboard speaks the language of the office it is sitting in. This is
the vocabulary, and `node scripts/campus-copy-audit.mjs` enforces the part of it
that can be enforced.

## Decided

| Say | Not | Why |
|---|---|---|
| **Pupil** | Student | What a ZW school calls a child on its roll. "Student" is the university word. |
| **Guardian** | — | Correct and legally meaningful here; a child's guardian is often not a parent. Kept. |
| **Admission number** | Student number | What is written on the form and read out at the front desk. |
| **Register** | Attendance sheet | The book a teacher marks. |
| **Term** | Semester | ZW schools run three terms. |
| **Fees** | Tuition | — |

## Identifiers are not copy

`studentNo`, `studentId`, `student.firstName`, `/api/v2/schools/students`,
`["schools", "students"]`, the `schools.students` grant and every route under
`/schools/students` are **correct as they are** and are deliberately left alone.

The word a school uses and the word the database uses are allowed to differ.
Renaming the second buys the reader nothing and costs an API surface, a set of
query keys and a migration. The audit script ignores them by design; a finding
it reports is always a piece of copy.

## The student portal is a different rule

`components/schools/portal/**` is excluded from both the codemod and the audit.
There the reader **is** the child, and the fix for "your student record" is the
second person — "your record" — not a different noun for them. Fixing that is a
separate pass with its own rule, and doing it with a find-and-replace would
produce "your pupil record", which is worse than what it replaced.

## Form or Grade — decided

A Zimbabwean secondary school says **Form 1–6**; a primary says **Grade 1–7**.
The product said "Year group" in 433 places, which is a British import and
wrong for both.

It is not a per-school setting, because a combined school runs both ladders at
once and its Grade 4 is not a Form. **The word comes from the class**, off a
rung the data already carried.

### The ladder

`SchoolClass.level` is one continuous ordering across the whole school, so a
list sorted by it reads top to bottom. `lib/schools/class-stage.ts` owns it:

| Level | Stage | Named |
|---|---|---|
| 0 | ECD | ECD A, ECD B |
| 1–7 | Grade | Grade 1–7 |
| 8–13 | Form | Form 1–6 |

### Saying it

| Where | Use | Gives |
|---|---|---|
| A screen | `useClassVocabulary()` | `words.One` → "Form" / "Grade" / "Form or grade" |
| A screen holding its own class list | `classVocabularyOf(classes)` | the same, without a second query |
| `ClassFilter` | nothing — it names itself | drop any `label` you were passing |
| A rung, shown to somebody | `rungName(level)` | "Form 1", not "8" |
| Server copy, no class list | the literal word "class" | never wrong, only unspecific |

A school with no levels set gets "class" everywhere, which is the fallback's
whole job: unspecific, never incorrect.

### What it turned up

The word was the smaller half of this. Chasing it found three places where the
rung itself was being read wrongly, each of them shipped:

- **The New class dialog** offered quick presets putting Form 1 at level 1,
  against provisioning's level 8. A combined school that used both got Form 1
  sorting above Grade 1. It asks for a stage and a year now, and computes the
  rung.
- **The exam series dialogs** asked for the cohort as a number under the hint
  *"Form 4 is 4"*. `registerCohort` matches that against `SchoolClass.level`,
  where Form 4 is 11 — so a combined school following the hint registered its
  **Grade 4 pupils as O-Level candidates**. Both dialogs pick a class now.
- **Search, the record peek and the merit leaderboard** printed the rung raw or
  hardcoded "Form", so Form 1 read as "Year group 8" and a primary school's
  Grade 4 leaderboard read "Form 4".

## Exeat — open

"Leave and outings" is the current label for the gate book. *Exeat* is the
boarding-school term and may be the right word for a ZW boarding school; it may
also be jargon nobody at the gate uses. Not changed without someone who knows.

## Keeping it

```bash
node scripts/campus-copy-audit.mjs          # summary
node scripts/campus-copy-audit.mjs --gaps   # one line per finding
node scripts/codemod-pupil.mjs --dry        # what a re-run would change
```

The audit exits non-zero on a finding, so it works as a gate. A new screen
written with "Student" in a heading is exactly the thing that quietly undoes
this, and nothing else in the repo would notice.
