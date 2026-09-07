import { test } from "./_support/fixtures";
import { CRM } from "./_support/tenants";
import { sweepRecordTests, sweepTests, type Route } from "./_support/sweep";
import { companyIdFor, db } from "./_support/db";

/**
 * Preferences, settings, users and templates — every workspace's own admin.
 *
 * Thirty-one pages at zero coverage. Swept on Hurudza Creative because it is
 * the one fixture with **no `CompanyFeatureFlag` rows at all** — it sits on its
 * subscription alone, so nothing here is turned away for reasons that belong to
 * `demo-focus` rather than to the product.
 *
 * ## Ten of these routes are redirects, and that is the finding
 *
 * `/user-management` and its four children, and all five of `/settings/*`, are
 * aliases into `/preferences/organization/*`. That is fine — the pages moved and
 * the old links are bookmarked — but it was not written down anywhere, and a
 * broken alias is a dead link in a menu somebody still ships. Each one now says
 * where it goes and fails if it goes elsewhere.
 *
 * Worth noticing while reading the list: the four `/user-management` sub-actions
 * — create, password-reset, role-change, status — all land on the same users
 * list. The actions became dialogs on that list and the routes were kept as
 * doors to the room rather than to the drawer. `/stores/issue` kept its
 * `?record=` query when it made the same move; these did not, so a bookmark to
 * "create a user" now opens a list. Recorded in `docs/testing/e2e-status.md`.
 *
 * ## Two shells, one settings area
 *
 * `/preferences/organization/departments` renders under the Account/Organization
 * sidebar; `/preferences/organization/branding` and `/templates` render under
 * the older Settings/Master Data one. Same URL prefix, two different chromes,
 * so moving between two items in the same menu changes the menu. A visual
 * finding rather than a functional one — also in the status doc.
 */

test.describe.configure({ timeout: 900_000 });
test.use({ tenant: CRM, as: "owner" });

const ACCOUNT: readonly Route[] = [
  {
    path: "/preferences",
    name: "Preferences index",
    redirectsTo: "/preferences/profile",
    expect: /Manage your account details for this workspace/i,
  },
  {
    path: "/preferences/profile",
    name: "My profile",
    expect: /Manage your account details for this workspace/i,
  },
  {
    path: "/preferences/appearance",
    name: "Appearance",
    expect: /Set your light, dark, or system theme preference/i,
  },
  {
    path: "/preferences/notifications",
    name: "Notification routing",
    expect: /Choose which updates should reach your account/i,
  },
];

const ORGANIZATION: readonly Route[] = [
  {
    path: "/preferences/organization",
    name: "Workspace context",
    expect: /Review workspace identity and access context/i,
  },
  {
    path: "/preferences/organization/billing",
    name: "Billing",
    expect: /Review plan, renewal, limits, and offline payment handling/i,
  },
  {
    path: "/preferences/organization/users",
    name: "Workspace users",
    expect: /Manage workspace users, roles, and account lifecycle/i,
  },
  {
    path: "/preferences/organization/sites",
    name: "Operational sites",
    expect: /Manage operational sites used across reporting and workflows/i,
  },
  {
    path: "/preferences/organization/departments",
    name: "Departments",
    expect: /Manage departments used for people, compensation, and approvals/i,
  },
  {
    path: "/preferences/organization/branding",
    name: "Branding index",
    redirectsTo: "/preferences/organization/branding/identity",
    expect: /Name, palette, font, and custom domain/i,
  },
  {
    path: "/preferences/organization/branding/identity",
    name: "Branding — identity and theme",
    expect: /Name, palette, font, and custom domain/i,
  },
  {
    path: "/preferences/organization/branding/assets",
    name: "Branding — assets and contact",
    expect: /Logos, signatures, and contact details/i,
  },
  {
    path: "/preferences/organization/branding/finance",
    name: "Branding — finance defaults",
    expect: /Banking, legal text, and document defaults/i,
  },
  {
    path: "/preferences/organization/templates",
    name: "Document templates",
    expect: /Template Library/i,
  },
];

/**
 * The legacy `/settings/*` and `/user-management/*` doors.
 *
 * Named `redirectsTo` rather than dropped from the list, so the suite fails if
 * one of them ever starts 404ing or lands somewhere new.
 */
const ALIASES: readonly Route[] = [
  {
    path: "/settings/branding",
    name: "Legacy settings — branding",
    redirectsTo: "/preferences/organization/branding/identity",
    expect: /Name, palette, font, and custom domain/i,
  },
  {
    path: "/settings/branding/identity",
    name: "Legacy settings — branding identity",
    redirectsTo: "/preferences/organization/branding/identity",
    expect: /Name, palette, font, and custom domain/i,
  },
  {
    path: "/settings/branding/assets",
    name: "Legacy settings — branding assets",
    redirectsTo: "/preferences/organization/branding/assets",
    expect: /Logos, signatures, and contact details/i,
  },
  {
    path: "/settings/branding/finance",
    name: "Legacy settings — branding finance",
    redirectsTo: "/preferences/organization/branding/finance",
    expect: /Banking, legal text, and document defaults/i,
  },
  {
    path: "/settings/templates",
    name: "Legacy settings — templates",
    redirectsTo: "/preferences/organization/templates",
    expect: /Template Library/i,
  },
  ...(
    [
      ["", "Legacy user management"],
      ["/create", "Legacy user management — create"],
      ["/password-reset", "Legacy user management — password reset"],
      ["/role-change", "Legacy user management — role change"],
      ["/status", "Legacy user management — status"],
    ] as const
  ).map(([suffix, name]) => ({
    path: `/user-management${suffix}`,
    name,
    redirectsTo: "/preferences/organization/users",
    expect: /Manage workspace users, roles, and account lifecycle/i,
  })),
];

const TEMPLATES: readonly Route[] = [
  {
    path: "/templates",
    name: "Template builder",
    /*
      The *populated* library, not its empty state.

      This first asserted "Forms, quotes, invoices, receipts and emails are all
      designed here" — correct, and correct only until `seed-crm-demo.ts`
      learned to write a template in this same pass, at which point my own seed
      falsified my own assertion.

      The string here is `TEMPLATE_KIND_DESCRIPTIONS.QUOTE` from
      `lib/crm/blocks.ts`, which the library prints as the heading of the Quote
      group. It appears only when a quote template exists, so it proves the
      library filled rather than that the page rendered.

      Deliberately not a nav word. `toContainText` reads the whole body, and
      this app's sidebar carries every module name in the product — "Templates",
      "Intake forms", "Quotes" and a hundred others are all in the string
      before the page content starts. Any assertion that could match the
      sidebar asserts nothing at all.
    */
    expect: /What a customer is offered, before they agree to it/i,
  },
];

sweepTests([...ACCOUNT, ...ORGANIZATION, ...ALIASES, ...TEMPLATES]);

sweepRecordTests([
  {
    name: "One workspace user",
    path: (id) => `/preferences/organization/users/${id}`,
    find: async () => {
      const companyId = await companyIdFor(CRM.slug, CRM.seed);
      const user = await db.user.findFirst({ where: { companyId }, select: { id: true } });
      return user?.id ?? null;
    },
    // The record page for a person, reached from the list above. No `expect`
    // on a name: the seed's owner is named in `_support/tenants.ts` and
    // asserting it here would duplicate that in a second place.
    note: "Identity is asserted by the page loading for a real id; the name lives in tenants.ts.",
  },
  {
    name: "One template",
    path: (id) => `/templates/${id}`,
    find: async () => {
      const companyId = await companyIdFor(CRM.slug, CRM.seed);
      const template = await db.crmTemplate.findFirst({
        where: { companyId },
        select: { id: true },
      });
      return template?.id ?? null;
    },
    note: "Skips until the CRM seed writes a template.",
  },
]);
