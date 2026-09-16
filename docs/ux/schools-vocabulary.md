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

## Form or Grade — open

A Zimbabwean secondary school says **Form 1–6**; a primary says **Grade 1–7**.
The product currently says "Year group" in 321 places, which is a British
import and wrong for both.

This is **not** a copy pass. The right label depends on the tenant, so it wants
a per-school setting driving the word — which means a schema question, a
default for existing tenants, and a decision about mixed primary/secondary
schools. `ClassFilter` and the classes master-data screen are where it would
hang. Left undone deliberately rather than half-done globally.

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
