import { test } from "./_support/fixtures";
import { RETAIL } from "./_support/tenants";
import { sweepTests, type Route } from "./_support/sweep";

/**
 * The public site, and the five public token links.
 *
 * `app/home/**` was at **zero** e2e coverage across eighteen pages — the
 * largest single untested cluster in the repo after the platform admin portal,
 * and the only one a stranger can reach without a password. Every other suite
 * in this directory tests something behind a login.
 *
 * ## Why it is swept on a tenant host
 *
 * The whole suite talks to one origin and nominates a host per tenant (see
 * `_support/tenants.ts`). The marketing pages are tenant-agnostic and render
 * identically wherever they are asked for; `/home` itself is the exception and
 * redirects to the tenant's sign-in, which is correct on a tenant host and is
 * asserted as such.
 *
 * ## The token pages
 *
 * `/a`, `/c`, `/f`, `/s` and `/v` take a token and no session: a quotation
 * sent for approval, a portal invite, a public intake form, a site sign-off.
 * They are the most exposed surface the product has, and the thing worth
 * proving about them is what a **bad** token does. A stranger with a guessed
 * or expired link must get a page saying so — not a stack trace, not a blank
 * screen, and above all not somebody else's record.
 *
 * Testing the invalid path rather than the happy path is deliberate. The happy
 * path needs a token minted by the module that owns it, and each of these
 * belongs to a different module; the refusal is shared, and it is the half
 * that carries the risk.
 */

test.describe.configure({ timeout: 600_000 });
test.use({ tenant: RETAIL, as: null });

const MARKETING: readonly Route[] = [
  {
    path: "/home",
    name: "Marketing home on a tenant host",
    // A tenant host belongs to a customer, so its root is that customer's
    // sign-in. The marketing home lives on the root domain.
    redirectsTo: "/login",
    expect: /Sign in|Welcome back/i,
  },
  { path: "/home/about", name: "About", expect: /Most businesses here are more profitable/i },
  { path: "/home/products", name: "Products", expect: /One record\. Every part of the business/i },
  { path: "/home/solutions", name: "Solutions", expect: /Six trades\. Six different holes/i },
  { path: "/home/schools", name: "Schools", expect: /Collect the fees you are owed/i },
  { path: "/home/pricing", name: "Pricing", expect: /Fiscalise from \$15 a month/i },
  { path: "/home/faq", name: "FAQ", expect: /Straight answers, including the ones that might rule us out/i },
  { path: "/home/contact", name: "Contact", expect: /hello@pagka\.dev/i },
  { path: "/home/book-demo", name: "Book a demo", expect: /Tell us where the money goes/i },
  {
    path: "/home/founding-partner",
    name: "Founding partner programme",
    expect: /Better terms, in exchange for a rollout that goes properly/i,
  },
  {
    path: "/home/implementation-support",
    name: "Implementation support",
    expect: /Software nobody finished setting up saves you nothing/i,
  },
  { path: "/home/privacy", name: "Privacy", expect: /What the website collects/i },
  { path: "/home/terms", name: "Terms", expect: /Pricing and proposals/i },
  { path: "/home/tools", name: "Free ZIMRA tools", expect: /Two compliance numbers, worked out properly/i },
  {
    path: "/home/tools/fiscalisation-penalty",
    name: "Fiscalisation penalty calculator",
    expect: /What is an unfiscalised till costing you a day\?/i,
  },
  {
    path: "/home/tools/vat-threshold",
    name: "VAT threshold checker",
    expect: /Do you have to register for VAT\?/i,
  },
  {
    path: "/home/states-preview",
    name: "Campus states preview",
    // The design system's own specimen page — every loading, empty and error
    // state a campus screen can be in, rendered side by side. It is public
    // because it needs no data, and it is the thing to look at when a table
    // starts rendering wrong.
    expect: /Campus states/i,
  },
];

/*
  Every canonical trade page. From `segments` in `app/home/site-data.ts`;
  retired slugs are 308'd in `next.config.ts` and never reach the route.
*/
const SEGMENTS = ["sellers", "service-providers", "workshops", "manufacturers", "sales-teams"];

const SEGMENT_ROUTES: readonly Route[] = SEGMENTS.map((slug) => ({
  path: `/home/solutions/${slug}`,
  name: `Solutions — ${slug}`,
  expect: /Corelith/i,
}));

/*
  A token nobody issued. Long enough to be plausible, and not a value any
  generator here produces.
*/
const NO_SUCH_TOKEN = "e2e0000000000000000000000000000000";

/*
  A 404 from the lookup behind each of these is the correct answer, and the
  browser logs it. Tolerated per route rather than added to `IGNORED`, so the
  same 404 anywhere else is still a failure — see `expectedConsoleError`.
*/
const UNKNOWN_TOKEN_404 = {
  pattern: /404 \(Not Found\).*\/api\/public\//,
  why: "A token nobody issued must 404. Answering 200 would be the bug.",
};

const PUBLIC_TOKEN_ROUTES: readonly Route[] = [
  {
    path: `/a/${NO_SUCH_TOKEN}`,
    name: "Public approval, unknown token",
    expect: /Document not found/i,
  },
  {
    path: `/c/${NO_SUCH_TOKEN}`,
    name: "Portal account claim, unknown token",
    /*
      "This invite has already been used", for a token that never existed.

      Deliberate, and documented at the call site: the endpoint refuses to sort
      guessed tokens into "wrong" and "used", so every reason a link stops
      working reads the same — and the commonest by far is a second tap on the
      same WhatsApp message, which is what the wording addresses. Asserted as
      it stands so that changing it stays a decision somebody makes on purpose.
    */
    expect: /This invite has already been used/i,
  },
  {
    path: `/f/${NO_SUCH_TOKEN}`,
    name: "Public form, unknown token",
    expect: /Form not found/i,
  },
  {
    path: `/s/${NO_SUCH_TOKEN}`,
    name: "Site sign-off, unknown token",
    expect: /This link isn't live/i,
  },
  {
    path: `/v/${NO_SUCH_TOKEN}`,
    name: "Public view, unknown token",
    expect: /This link isn't live/i,
  },
].map((route) => ({ ...route, expectedConsoleError: UNKNOWN_TOKEN_404 }));

/**
 * The two doors that belong to the platform rather than to a tenant.
 *
 * `/admin/login` is the platform operator's sign-in, and on a *tenant* host it
 * forwards to that tenant's own — the admin console lives on the admin root
 * domain, and a customer's hostname must not offer a way in to it. That
 * forward is the assertion.
 *
 * `/preview-host` is the diagnostic this whole suite depends on: it reports
 * which host the deployment is being treated as. If it ever stopped answering,
 * every tenant in `_support/tenants.ts` would be talking to the wrong shop and
 * the failures would look like anything but a host problem.
 */
const PLATFORM: readonly Route[] = [
  {
    path: "/admin/login",
    name: "Platform admin sign-in on a tenant host",
    redirectsTo: "/login",
    expect: /Welcome back to ACME Inc/i,
  },
  {
    path: "/preview-host",
    name: "Preview host diagnostic",
    expect: /This deployment answers on a generated hostname/i,
  },
];

sweepTests([...MARKETING, ...SEGMENT_ROUTES, ...PUBLIC_TOKEN_ROUTES, ...PLATFORM]);
