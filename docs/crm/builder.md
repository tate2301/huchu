# Build

Where a workspace builds what its people fill in, and reads back what came of
it. `/crm/build` lists everything by where it is used — site visits, enquiries,
reports — with templates to start the next one from.

| Where | What |
| --- | --- |
| `/crm/build` | Templates, and every form and report grouped by where it is used |
| `/crm/build/visits/<id>` | A site-visit form in the builder |
| `/crm/build/visits/<id>/insights` | What the form's visits say about it |
| `/crm/build/enquiries/<id>` | An enquiry (intake) form in the builder |
| `/reports/custom/<id>/edit` | A report: query blocks as steps or SQL (see `docs/reports/custom-reports.md`) |

## The builder

`components/builder/builder-shell.tsx` is one screen for every form: the kinds
of question on the left, the form on the canvas — filled in to test it, the way
it will be filled in — the selected question's settings and rules on the right,
and underneath, the test answers, the quote they draft and anything wrong.

A question is `FieldDefinition` (`lib/forms/fields.ts`) wherever it is asked.
The measuring kinds — length, area, areas, count, reading, run — each come to a
figure (`measureOf`), and a quote line (`lib/forms/quote.ts`) takes its
quantity from one: scaled for waste, rounded up to whole packs, and drafted only
when the answers say so (a damp-proof primer when moisture is over 4%).

## Site visits

Site-visit questions are `CrmQuestion` rows, because answers are rows with
foreign keys to them. `lib/crm/site-visits/fields.ts` turns a row into a field
and back; what a field says that has no column (bounds, an area's shape, the
warning range, `showWhen`) is in `CrmQuestion.settings`, and a set's quote lines
in `CrmQuestionSet.quoteLines`. A measured answer keeps its measurements in
`valueJson` and the figure they come to in `valueNumber`.

On the visit the rep sees the same fields, asked only when the answers call for
them, and the quote drafting as they measure. Completing the visit fetches
`/api/v2/crm/appointments/<id>/quote-draft` and starts a new quotation with the
drafted lines.

Templates (`lib/crm/site-visits/builder-templates.ts`) are copied, never linked:
four measured surveys and a close-out, and every section of the tenant's
question bank. A form made from one starts as a draft that reps are not shown.

## Insights

`lib/crm/site-visits/insights.ts` reads a form's visits: how often each question
is answered when it is asked, visits by the answer to the first pick-one with
what they measured and won, and the optional question that decides what is
quoted and went unanswered most — offered as one click to make it required.

The report sources `crm-visit-forms` and `crm-visit-answers` put the same data
in reach of any report.
