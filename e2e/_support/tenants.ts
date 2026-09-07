/**
 * Every tenant the end-to-end suite signs into, and every login it uses.
 *
 * Before this file, each spec carried its own copy of the host and the
 * credentials — `retail-shots`, `retail-workflows`, `retail-void` and
 * `crm-overlays` each had their own. Four copies is four chances for a re-seed
 * to leave one behind, and the failure reads as "sign-in refused" rather than
 * "you changed the password in the seed".
 *
 * The rule: **a credential appears here or nowhere.** Specs name a person, not
 * a password.
 *
 * ## One origin, many hosts
 *
 * Tenant and portal hosts would each need a line in the machine's hosts file,
 * and on this workstation we cannot add them — no admin rights, and no wildcard
 * escape (the router's DNS-rebind protection hijacks `*.localtest.me` to
 * 192.168.1.1).
 *
 * `docs/_start-here/STAGING_PREVIEW.md` documents the way round it that the app
 * already supports, and names the `x-huchu-preview-host` header as the one for
 * the e2e suite specifically. The browser talks to a single origin and *tells*
 * the server which host to behave as.
 *
 * This is not a bypass. Sign-in is still scoped to the tenant the nominated
 * host resolves to, the session still carries that tenant's `allowedHosts`,
 * enforcement still runs against the nominated host, and an inactive tenant is
 * still refused. Only the hostname arrives by a different route.
 *
 * The origin is deliberately **not** localhost: `lib/platform/preview-host.ts`
 * relaxes strict enforcement for loopback, and a suite that ran with
 * enforcement off would not be testing the paths production takes.
 *
 * See `docs/testing/e2e-plan-2026-09-01.md` §3.
 */

/** The single origin every request goes to. Must resolve, and must not be localhost. */
export const ORIGIN = process.env.E2E_BASE_URL ?? "http://acme.apps.pagka.local:300";

/** The suffix nominated hosts are built from — what production's root domain would be. */
const ROOT = process.env.E2E_ROOT_HOST ?? "apps.pagka.local:300";

/**
 * How a host is nominated. Both from `lib/platform/preview-host.ts`.
 *
 * The cookie is what this suite uses — see the note in `fixtures.ts` for why
 * the header, which `STAGING_PREVIEW.md` recommends, is wrong inside a browser.
 * The header is kept exported for API-level checks driven by `request`, where
 * there is no CORS to trip over and it beats the cookie.
 */
export const PREVIEW_HOST_HEADER = "x-huchu-preview-host";
export const PREVIEW_HOST_COOKIE = "__huchu_preview_host";

export type PortalKey = "student" | "parent" | "teacher" | "pos";

/**
 * Portal subdomain prefixes, mirroring `lib/platform/portal-hosts.ts`.
 *
 * `staff` is the *teacher* portal today, not a staff portal — slice P-10 moves
 * teachers to `teachers.` so `staff.` can be reused. Copied here rather than
 * imported so an e2e run does not drag app code into the runner, but it must
 * track that file.
 */
const PORTAL_PREFIX: Record<PortalKey, string> = {
  student: "students",
  parent: "parents",
  teacher: "staff",
  pos: "pos",
};

export type Login = {
  /** Who this is, for test names and failure messages. */
  label: string;
  email: string;
  password: string;
  /** Roughly what they are allowed to do — drives the role-gating specs. */
  role: string;
};

export type Tenant = {
  /** Tenant slug, and the first label of its nominated host. */
  slug: string;
  /** Human name, as it appears in the workspace switcher. */
  name: string;
  /** Which vertical's suite owns this tenant. */
  vertical: "retail" | "schools" | "gold" | "crm" | "payroll";
  /** Seed command that builds it, for the failure message when it is missing. */
  seed: string;
  logins: Record<string, Login>;
};

/** The host this tenant's main app would be on in production. */
export function tenantHost(tenant: Tenant): string {
  return `${tenant.slug}.${ROOT}`;
}

/** The host one of this tenant's portals would be on in production. */
export function portalHost(tenant: Tenant, portal: PortalKey): string {
  return `${PORTAL_PREFIX[portal]}.${tenant.slug}.${ROOT}`;
}

/* ── The tenants ──────────────────────────────────────────────────────── */

export const RETAIL: Tenant = {
  slug: "acme",
  name: "ACME Inc",
  vertical: "retail",
  seed: "npx tsx scripts/seed-retail-demo.ts --slug acme --days 180 --reset",
  logins: {
    owner: {
      label: "Rutendo Chikafu",
      email: "owner@bottlestore.test",
      password: "RetailDemo123!",
      role: "SUPERADMIN",
    },
    manager: {
      label: "Tafara Nyathi",
      email: "tafara.manager@bottlestore.test",
      password: "RetailDemo123!",
      role: "MANAGER",
    },
    cashier: {
      label: "Chipo Dube",
      email: "chipo.till@bottlestore.test",
      password: "RetailDemo123!",
      role: "CASHIER",
    },
    cashier2: {
      label: "Farai Moyo",
      email: "farai.till@bottlestore.test",
      password: "RetailDemo123!",
      role: "CASHIER",
    },
    stock: {
      label: "Tendai Sibanda",
      email: "tendai.stock@bottlestore.test",
      password: "RetailDemo123!",
      role: "STOCK_CLERK",
    },
  },
};

export const PAYROLL: Tenant = {
  slug: "payroll-demo",
  name: "Kariba Payroll Bureau",
  vertical: "payroll",
  seed: "npx tsx scripts/seed-payroll-demo.ts",
  logins: {
    admin: {
      label: "Rudo Chirwa",
      email: "rudo.chirwa@payroll-demo.test",
      password: "Password123!",
      role: "SUPERADMIN",
    },
  },
};

/**
 * The service provider. A creative agency with a year of trading behind it:
 * 180 leads, 90 deals, 1,165 activities, 57 quotations, 22 invoices, 20 receipts.
 *
 * Three scripts in order, because neither CRM seed creates a tenant or a user —
 * they fill a module on a tenant that already exists, and `seed-crm-demo`
 * specifically looks up an owner with `user.findFirst`. `seed-staging-tenant`
 * is what provides both.
 */
export const CRM: Tenant = {
  slug: "hurudza-creative",
  name: "Hurudza Creative",
  vertical: "crm",
  seed: [
    "npx tsx scripts/seed-staging-tenant.ts --slug hurudza-creative --email tafadzwa@hurudza.test --password 'Password123!' --name 'Hurudza Creative' --user-name 'Tafadzwa Mukono' --profile GENERAL",
    "npx tsx scripts/seed-crm-demo.ts --slug hurudza-creative",
    "npx tsx scripts/seed-crm-year.ts --slug hurudza-creative",
  ].join("\n  "),
  logins: {
    owner: {
      label: "Tafadzwa Mukono",
      email: "tafadzwa@hurudza.test",
      password: "Password123!",
      role: "SUPERADMIN",
    },
  },
};

/**
 * The gold mine. A quarter of trading: 154 shift allocations across three
 * shafts, 931 worker shares, 6 pours, 5 dispatches, 4 buyer receipts, 90 daily
 * prices, and a closed period.
 *
 * Roles matter more here than anywhere else — settlement approval is gated, so
 * `manager` and `clerk` are not interchangeable. The clerk raises, the manager
 * approves.
 */
export const GOLD: Tenant = {
  slug: "huchu-enterprises",
  name: "Huchu Enterprises",
  vertical: "gold",
  seed: [
    "npx tsx scripts/seed-staging-tenant.ts --slug huchu-enterprises --email mine@huchu-enterprises.test --password 'GoldDemo123!' --name 'Huchu Enterprises' --user-name 'Mine Manager' --profile GOLD_MINE",
    "npx tsx scripts/seed-gold-demo.ts --slug huchu-enterprises --reset",
  ].join("\n  "),
  logins: {
    admin: {
      label: "Mine Manager",
      email: "mine@huchu-enterprises.test",
      password: "GoldDemo123!",
      role: "SUPERADMIN",
    },
    manager: {
      label: "Nyasha Mudzingwa",
      email: "nyasha.mudzingwa@huchu-enterprises.test",
      password: "GoldDemo123!",
      role: "MANAGER",
    },
    clerk: {
      label: "Tapiwa Chuma",
      email: "tapiwa.chuma@huchu-enterprises.test",
      password: "GoldDemo123!",
      role: "CLERK",
    },
  },
};

/**
 * The school, and the only tenant with portals worth testing.
 *
 * 120 pupils across 6 classes, 8 teachers, 119 guardians, a term of registers,
 * two papers per class-subject, and 120 fee invoices in a mix of paid, part-paid
 * and overdue.
 *
 * `student`, `parent` and `teacher` are the portal logins. They are the reason
 * `seed-school-demo.ts` had to exist: `provisionSchool` creates no people, so
 * before it there was nobody to sign into a portal *as*.
 */
export const SCHOOL: Tenant = {
  slug: "stmarys",
  name: "St Marys High School",
  vertical: "schools",
  seed: [
    "npx tsx scripts/seed-staging-tenant.ts --slug stmarys --email head@stmarys.test --password 'SchoolDemo123!' --name 'St Marys High School' --user-name 'Head Teacher' --profile SCHOOLS",
    "npx tsx scripts/seed-school-demo.ts --slug stmarys --reset",
  ].join("\n  "),
  logins: {
    head: {
      label: "Head Teacher",
      email: "head@stmarys.test",
      password: "SchoolDemo123!",
      role: "SUPERADMIN",
    },
    teacher: {
      label: "Grace Mutasa",
      email: "grace.mutasa@stmarys.test",
      password: "SchoolDemo123!",
      role: "HOD",
    },
    student: {
      label: "Rumbidzai Chirwa (STU-0001)",
      email: "student@stmarys.test",
      password: "SchoolDemo123!",
      role: "STUDENT",
    },
    parent: {
      label: "Parent of STU-0001",
      email: "parent@stmarys.test",
      password: "SchoolDemo123!",
      role: "PARENT",
    },
  },
};

export const TENANTS = [RETAIL, PAYROLL, CRM, GOLD, SCHOOL] as const;

/**
 * Look a login up by name, and fail with the seed command rather than
 * `undefined` when it is missing. A spec that asks for a person the seed never
 * created should say so in one line.
 */
export function loginFor(tenant: Tenant, who: string): Login {
  const login = tenant.logins[who];
  if (!login) {
    const known = Object.keys(tenant.logins);
    throw new Error(
      `No login "${who}" on tenant ${tenant.slug}. ` +
        (known.length
          ? `Known: ${known.join(", ")}.`
          : "That tenant has no seeded logins yet.") +
        `\nSeed it with:\n  ${tenant.seed}`,
    );
  }
  return login;
}
