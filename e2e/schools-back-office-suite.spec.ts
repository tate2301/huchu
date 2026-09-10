import { test, expect } from "./_support/fixtures";
import { SCHOOL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";
import { expectHealthyPage } from "./_support/assert";
import { visitSettled } from "./_support/nav";

/**
 * The school's remaining back office — the twenty-five screens `schools-suite`
 * does not reach.
 *
 * Results moderation and publishing, the fee ledger and its two sub-views,
 * lesson plans, teaching resources, transport, parents' evenings, library
 * loans, subject targets, support staff, and the whole of school master data.
 *
 * ## Nine of them are forwards, and every one is deliberate
 *
 * Unusually for this codebase, each redirect stub carries a docstring saying
 * why it moved — the scheme of work went to the teacher portal because "it sat
 * in the administrator's Academics page, where the people who write it could
 * not reach it"; publish windows went to master data because they are
 * configuration rather than daily work. So the sweep asserts the destination
 * rather than treating the move as drift, and where a forward carries a query
 * — `?view=refunds`, `?view=waivers` — the query is asserted too, because a
 * forward that drops it lands you on the wrong tab of the right page.
 *
 * ## The three portal aliases
 *
 * `/schools/portal/{parent,student,teacher}` forward to the portals. Asked for
 * by the head teacher — who is not a parent, not a pupil and not on the
 * teaching roster — each correctly refuses with an explanation rather than an
 * error. That refusal is the assertion: an office account must not be able to
 * read a family's portal, and "not linked" is how the product says so.
 */

test.describe.configure({ timeout: 900_000 });
test.use({ tenant: SCHOOL, as: "head" });

const RESULTS: readonly Route[] = [
  {
    path: "/schools/results/moderation",
    name: "Results moderation queue",
    expect: /Sheets a head of department has to sign off before anything can be published/i,
  },
  {
    path: "/schools/results/publish",
    name: "Results publishing",
    expect: /The windows marks may go out through/i,
  },
  {
    path: "/schools/results/publish/windows",
    name: "Publish windows (moved to master data)",
    redirectsTo: "/management/master-data/schools/grading",
    expect: /Grade boundaries, and the windows in which results may be published/i,
  },
];

const FINANCE: readonly Route[] = [
  {
    path: "/schools/finance/ledger",
    name: "Fee ledger",
    // 120 invoices and 75 unpaid on this seed. Asserting the shape of the
    // figure rather than the figure: a receipt posted by another spec moves it.
    expect: /outstanding/i,
  },
  {
    path: "/schools/finance/refunds",
    name: "Refunds (ledger view)",
    redirectsTo: "/schools/finance/ledger",
    expect: /A refund is always drawn/i,
  },
  {
    path: "/schools/finance/waivers",
    name: "Waivers (ledger view)",
    redirectsTo: "/schools/finance/ledger",
    expect: /A waiver is decided, then applied/i,
  },
];

const TEACHING: readonly Route[] = [
  {
    path: "/schools/teaching/lessons",
    name: "Lesson plans",
    expect: /Lay out from timetable/i,
  },
  {
    path: "/schools/teaching/resources",
    name: "Teaching resources",
    expect: /Nothing on the shelf yet/i,
  },
  {
    path: "/schools/academics/syllabus",
    name: "Scheme of work (moved to the teacher portal)",
    redirectsTo: "/portal/teacher/syllabus",
    expect: /A scheme of work is one subject's term for one form/i,
  },
  {
    path: "/schools/academics/identity",
    name: "School records (moved to master data)",
    redirectsTo: "/management/master-data/schools/identity",
    expect: /Admission numbering/i,
  },
];

const PASTORAL: readonly Route[] = [
  { path: "/schools/goals", name: "Subject targets", expect: /Nobody has set these children anything/i },
  { path: "/schools/staff", name: "Support staff", expect: /No support staff yet/i },
  {
    path: "/schools/meetings",
    name: "Parents' evenings",
    /*
      No apostrophes in the pattern. The source writes `&rsquo;`, which renders
      as U+2019, and an ASCII `'` does not match it — the kind of failure that
      reads as "the page is wrong" when the page is exactly right.
    */
    expect: /evenings across the whole staff room/i,
  },
  {
    path: "/schools/library/loans",
    name: "Library loans",
    expect: /Every book that is out is still within its date/i,
  },
  {
    path: "/schools/transport",
    name: "Transport routes",
    expect: /A route is a bus, a driver and a line of stops/i,
  },
];

/**
 * Master data, all seven screens. Reached at `/management/master-data/**` and
 * owned by the school rather than by Management: `demo-focus` keeps `admin.*`
 * for every vertical, and these seven are the ones only a school can fill in.
 */
const MASTER_DATA: readonly Route[] = [
  {
    path: "/management/master-data",
    name: "Master data overview",
    expect: /Operational reference data stays here/i,
  },
  {
    path: "/management/master-data/schools/years",
    name: "Years and terms",
    expect: /Academic years/i,
  },
  {
    path: "/management/master-data/schools/classes",
    name: "Classes and streams",
    expect: /Classes and Streams/i,
  },
  {
    path: "/management/master-data/schools/subjects",
    name: "Subjects",
    expect: /What the school teaches/i,
  },
  {
    path: "/management/master-data/schools/periods",
    name: "The school day",
    expect: /Periods and rooms/i,
  },
  {
    path: "/management/master-data/schools/grading",
    name: "Grading and publishing",
    expect: /Grade boundaries, and the windows in which results may be published/i,
  },
  {
    path: "/management/master-data/schools/identity",
    name: "School records",
    expect: /Admission numbering/i,
  },
  {
    path: "/management/master-data/hr/job-grades",
    name: "Job grades",
    expect: /Workforce classification/i,
  },
  {
    path: "/management/master-data/operations/sections",
    name: "Sections",
    expect: /Operational areas/i,
  },
  {
    path: "/management/master-data/hr/departments",
    name: "Departments (moved to preferences)",
    redirectsTo: "/preferences/organization/departments",
    expect: /Manage departments used for people, compensation, and approvals/i,
  },
  {
    path: "/management/master-data/operations/sites",
    name: "Sites (moved to preferences)",
    redirectsTo: "/preferences/organization/sites",
    expect: /Manage operational sites used across reporting and workflows/i,
  },
  {
    // Downtime codes are a mining concept. A school asking for them must be
    // turned away, and this is the assertion that it is.
    path: "/management/master-data/operations/downtime-codes",
    name: "Downtime codes",
    blocked: true,
  },
];

const PORTAL_ALIASES: readonly Route[] = [
  {
    path: "/schools/portal/parent",
    name: "Parent portal alias, asked for by the office",
    redirectsTo: "/portal/parent",
    expect: /This account is not linked to a family/i,
  },
  {
    path: "/schools/portal/student",
    name: "Student portal alias, asked for by the office",
    redirectsTo: "/portal/student",
    expect: /This account is not linked to a pupil/i,
  },
  {
    path: "/schools/portal/teacher",
    name: "Teacher portal alias, asked for by the office",
    redirectsTo: "/portal/teacher",
    expect: /You are not linked to a teacher profile/i,
  },
];

sweepTests([
  ...RESULTS,
  ...FINANCE,
  ...TEACHING,
  ...PASTORAL,
  ...MASTER_DATA,
  ...PORTAL_ALIASES,
]);

/**
 * The two ledger forwards land on the right *tab*, not just the right page.
 *
 * `/schools/finance/refunds` and `/waivers` both redirect to the ledger, and
 * both differ only by `?view=`. Dropping the query would leave every bookmarked
 * "refunds" link opening on invoices — a page that is perfectly healthy, and
 * not the one that was asked for, which is precisely the kind of regression a
 * route sweep cannot see.
 */
for (const view of ["refunds", "waivers"] as const) {
  test(`Bookmarked /schools/finance/${view} lands on the ${view} view`, async ({
    page,
    console_,
  }) => {
    await visitSettled(page, `/schools/finance/${view}`, { landsOn: "/schools/finance/ledger" });

    expect(
      new URL(page.url()).searchParams.get("view"),
      `/schools/finance/${view} must arrive with ?view=${view}, or it opens on invoices`,
    ).toBe(view);

    await expectHealthyPage(page, console_);
  });
}
