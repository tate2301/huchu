import { describe, expect, it } from "vitest";

import {
  inferWorkspaceProfileFromEnabledFeatures,
  WORKSPACE_PROFILES,
} from "@/lib/workspace-products";
import { getWorkspaceSidebarModel } from "@/lib/workspaces";
import { resolveWorkspaceVerticalProductBundle } from "@/lib/workspace-products";

/**
 * Which business is this, and does the workspace say so?
 *
 * ## Why this file exists
 *
 * The workspace switcher sits top-left, above the sidebar, on every
 * authenticated page. It read **"Retail"** on St Mary's student roll and on
 * Huchu Enterprises' gold dispatch ledger — the first thing on the page, naming
 * the wrong business, on every screen of every vertical.
 *
 * Nothing caught it. Every page rendered, nothing threw, every number was
 * right; the end-to-end suite was 139/139 green while this was true. It was
 * found by *looking at the Phase 4 screenshots*, which is a poor substitute for
 * a test and the reason this file is here.
 *
 * Two causes, both fixed:
 *
 *   1. `inferWorkspaceProfileFromEnabledFeatures` took the first match from an
 *      ordered chain with retail at the top, so one `retail.*` key made a
 *      school a shop. It now weighs how much of each vertical is switched on.
 *   2. Every demo tenant was seeded with `workspaceProfile` at its GENERAL
 *      default, so all of them fell through to that inference. The vertical
 *      seeds now say what they are.
 *
 * ## What "all business cases" means here
 *
 * One test per shape of customer this product is actually sold to, plus the
 * awkward combinations. A case is worth writing when getting it wrong would put
 * the wrong name above somebody's sidebar.
 */

/* ── Feature sets, as a real tenant would hold them ───────────────────── */

const FOUNDATIONAL = [
  "accounting.core",
  "accounting.ar",
  "accounting.ap",
  "hr.employees",
  "hr.payroll",
];

const RETAIL_FEATURES = [
  "retail.core",
  "retail.sell",
  "retail.catalog",
  "retail.stock",
  "retail.purchasing",
  "portal.pos",
];

const SCHOOL_FEATURES = [
  "schools.core",
  "schools.students",
  "schools.attendance",
  "schools.fees",
  "schools.results",
  "schools.timetable",
];

const GOLD_FEATURES = [
  "gold.home",
  "gold.dispatches",
  "gold.receipts",
  "gold.payouts",
  "gold.exceptions",
  "gold.audit-trail",
];

const CRM_FEATURES = ["crm.core", "crm.leads", "crm.clients", "crm.insights"];

const PAYROLL_BUREAU = ["hr.employees", "hr.payroll", "hr.statutory-tables"];

/** Everything. What `seed-staging-tenant.ts` actually grants. */
const EVERYTHING = [
  ...FOUNDATIONAL,
  ...RETAIL_FEATURES,
  ...SCHOOL_FEATURES,
  ...GOLD_FEATURES,
  ...CRM_FEATURES,
  "hr.statutory-tables",
];

/* ── Inference: one vertical ──────────────────────────────────────────── */

describe("inferring a workspace from what is switched on", () => {
  it("reads a bottle store as retail", () => {
    expect(inferWorkspaceProfileFromEnabledFeatures([...FOUNDATIONAL, ...RETAIL_FEATURES])).toBe(
      "RETAIL",
    );
  });

  it("reads a school as a school", () => {
    expect(inferWorkspaceProfileFromEnabledFeatures([...FOUNDATIONAL, ...SCHOOL_FEATURES])).toBe(
      "SCHOOLS",
    );
  });

  it("reads a mine as a mine", () => {
    expect(inferWorkspaceProfileFromEnabledFeatures([...FOUNDATIONAL, ...GOLD_FEATURES])).toBe(
      "GOLD_MINE",
    );
  });

  it("reads a payroll bureau as a bureau", () => {
    expect(inferWorkspaceProfileFromEnabledFeatures(PAYROLL_BUREAU)).toBe("PAYROLL");
  });

  it("has no answer for a tenant with nothing vertical switched on", () => {
    // Null, not GENERAL: "I cannot tell" and "this is a general business" are
    // different answers, and the caller decides what to do with the first.
    expect(inferWorkspaceProfileFromEnabledFeatures(FOUNDATIONAL)).toBeNull();
    expect(inferWorkspaceProfileFromEnabledFeatures([])).toBeNull();
    expect(inferWorkspaceProfileFromEnabledFeatures(undefined)).toBeNull();
  });

  it("does not treat CRM as a vertical of its own", () => {
    // A service provider is a GENERAL workspace carrying the CRM product, not a
    // fifth profile. `resolveGeneralVerticalProduct` picks the bundle.
    expect(inferWorkspaceProfileFromEnabledFeatures([...FOUNDATIONAL, ...CRM_FEATURES])).toBeNull();
  });
});

/* ── Inference: more than one vertical, which is the real test ────────── */

describe("a tenant that spans two verticals", () => {
  /*
    These are the cases the old first-match chain got wrong, and why it was
    wrong is worth keeping in view: with one signal per vertical there is
    nothing to choose between them, so the order of the `if`s decided, and
    retail was first.
  */

  it("is a school, when it is a school with a tuck shop", () => {
    expect(
      inferWorkspaceProfileFromEnabledFeatures([
        ...FOUNDATIONAL,
        ...SCHOOL_FEATURES,
        "retail.core",
        "retail.sell",
      ]),
    ).toBe("SCHOOLS");
  });

  it("is a mine, when it is a mine with a company store", () => {
    expect(
      inferWorkspaceProfileFromEnabledFeatures([
        ...FOUNDATIONAL,
        ...GOLD_FEATURES,
        "retail.core",
        "retail.stock",
      ]),
    ).toBe("GOLD_MINE");
  });

  it("is a shop, when it is a shop that also sells to two schools", () => {
    // The mirror image. Weight has to cut both ways or it is just a new
    // hard-coded winner.
    expect(
      inferWorkspaceProfileFromEnabledFeatures([
        ...FOUNDATIONAL,
        ...RETAIL_FEATURES,
        "schools.core",
      ]),
    ).toBe("RETAIL");
  });

  it("is a school that runs payroll, not a bureau", () => {
    // Unchanged behaviour, kept because it is the case that breaks if somebody
    // moves the payroll check above the verticals.
    expect(inferWorkspaceProfileFromEnabledFeatures([...SCHOOL_FEATURES, ...PAYROLL_BUREAU])).toBe(
      "SCHOOLS",
    );
  });

  it("is not a bureau merely for having payroll switched on", () => {
    expect(inferWorkspaceProfileFromEnabledFeatures(["hr.employees", "hr.payroll"])).toBeNull();
  });

  it("keeps the old precedence when two verticals are genuinely level", () => {
    /*
      Equal weight is a real tie and somebody has to win it. Gold does, because
      that is the order in `PROFILE_FEATURE_EVIDENCE` and matching the previous
      behaviour means no tenant moves without a reason.
    */
    expect(
      inferWorkspaceProfileFromEnabledFeatures(["gold.home", "schools.core", "retail.core"]),
    ).toBe("GOLD_MINE");
  });
});

/* ── The switcher label, which is what anyone actually sees ───────────── */

describe("the name above the sidebar", () => {
  const model = (profile: string | null, enabledFeatures: string[]) =>
    getWorkspaceSidebarModel({
      role: "SUPERADMIN",
      enabledFeatures,
      workspaceProfile: profile,
    });

  it("names each vertical from its explicit profile", () => {
    expect(model("SCHOOLS", EVERYTHING).workspaceLabel).toBe("School Operations");
    expect(model("GOLD_MINE", EVERYTHING).workspaceLabel).toBe("Gold Operations");
    expect(model("RETAIL", EVERYTHING).workspaceLabel).toBe("Retail");
    expect(model("PAYROLL", EVERYTHING).workspaceLabel).toBe("Payroll");
  });

  it("never says Retail above a school or a mine", () => {
    /*
      The regression, stated as plainly as it can be. Both of these tenants hold
      the complete feature set, exactly as `seed-staging-tenant.ts` grants it,
      because that is the condition under which this broke: with everything
      switched on there is nothing to infer from and the explicit profile is the
      only thing left telling the truth.
    */
    for (const profile of ["SCHOOLS", "GOLD_MINE", "PAYROLL"] as const) {
      expect(model(profile, EVERYTHING).workspaceLabel).not.toBe("Retail");
    }
  });

  it("honours the explicit profile over anything inference would have said", () => {
    // A school holding every retail key is still a school if it says so.
    expect(model("SCHOOLS", [...RETAIL_FEATURES, ...SCHOOL_FEATURES]).workspaceLabel).toBe(
      "School Operations",
    );
  });

  it("falls back to inference only when no profile is set", () => {
    expect(model(null, [...FOUNDATIONAL, ...SCHOOL_FEATURES]).workspaceLabel).toBe(
      "School Operations",
    );
    expect(model(null, [...FOUNDATIONAL, ...GOLD_FEATURES]).workspaceLabel).toBe("Gold Operations");
    expect(model(undefined as unknown as null, [...FOUNDATIONAL, ...RETAIL_FEATURES]).workspaceLabel).toBe(
      "Retail",
    );
  });

  it("lets a service business say it is general and stay general", () => {
    /*
      `normalizeWorkspaceProfile` answers GENERAL both to `null` and to the
      string "GENERAL", and GENERAL used to mean "go and infer". So a service
      provider could not hold its ground: Hurudza Creative, a creative agency
      on the CRM product, came back as **School Operations** with a school's
      sidebar, while its own screen showed companies numbered CRMC- and every
      owner set to Tafadzwa Mukono.

      Found in a screenshot again, and only because the workspace fix before it
      had changed the wrong answer from "Retail" to "School Operations" — which
      is the useful thing about a wrong answer that moves: it proves the value
      is being computed rather than read.

      "I have no profile" is a question. "I am a general business" is an answer.
    */
    expect(model("GENERAL", EVERYTHING).workspaceLabel).not.toBe("School Operations");
    expect(model("GENERAL", [...FOUNDATIONAL, ...CRM_FEATURES]).workspaceLabel).toBe("Sales & CRM");
  });

  it("still infers for a tenant that has never had a profile set", () => {
    // The other half. Turning inference off entirely would strand every tenant
    // provisioned before `workspaceProfile` existed on the general dashboard.
    expect(model(null, [...FOUNDATIONAL, ...SCHOOL_FEATURES, "retail.core"]).workspaceLabel).toBe(
      "School Operations",
    );
  });

  it("gives every profile a label and an icon, so none can render blank", () => {
    for (const profile of WORKSPACE_PROFILES) {
      const resolved = model(profile, EVERYTHING);
      expect(resolved.workspaceLabel, `${profile} has no label`).toBeTruthy();
      expect(resolved.workspaceIcon, `${profile} has no icon`).toBeTruthy();
    }
  });

  it("sends each vertical home to its own front door", () => {
    expect(model("SCHOOLS", EVERYTHING).homeHref).toMatch(/^\/schools/);
    expect(model("GOLD_MINE", EVERYTHING).homeHref).toMatch(/^\/gold/);
    expect(model("RETAIL", EVERYTHING).homeHref).toMatch(/^\/retail/);
  });
});

/* ── What the sidebar leads with ──────────────────────────────────────── */

describe("what the sidebar puts first", () => {
  const primaryHrefs = (profile: string) =>
    getWorkspaceSidebarModel({
      role: "SUPERADMIN",
      enabledFeatures: EVERYTHING,
      workspaceProfile: profile,
    })
      .sections.filter((section) => section.workspaceGroup !== "additional")
      .flatMap((section) => section.items.map((item) => item.href));

  it("leads a school with school work, not with the shop floor", () => {
    /*
      The other half of the screenshot problem. A head teacher opening St Mary's
      met "Run the Floor", "Range & Stock" and "Purchasing" above Students and
      Attendance — every module the platform has, in a fixed order, on a tenant
      entitled to all of them.
    */
    const hrefs = primaryHrefs("SCHOOLS");
    expect(hrefs.some((href) => href.startsWith("/schools"))).toBe(true);
    expect(hrefs.some((href) => href.startsWith("/retail"))).toBe(false);
  });

  it("leads a mine with the gold chain", () => {
    const hrefs = primaryHrefs("GOLD_MINE");
    expect(hrefs.some((href) => href.startsWith("/gold"))).toBe(true);
    expect(hrefs.some((href) => href.startsWith("/schools"))).toBe(false);
  });

  it("leads a shop with the shop", () => {
    const hrefs = primaryHrefs("RETAIL");
    expect(hrefs.some((href) => href.startsWith("/retail"))).toBe(true);
    expect(hrefs.some((href) => href.startsWith("/gold"))).toBe(false);
  });

  it("gives every profile something to click", () => {
    // A workspace with no primary section is a blank sidebar, which is worse
    // than the wrong sidebar.
    for (const profile of WORKSPACE_PROFILES) {
      expect(primaryHrefs(profile).length, `${profile} has an empty sidebar`).toBeGreaterThan(0);
    }
  });
});

/* ── The same mistake, in four places ─────────────────────────────────── */

describe("an explicit GENERAL survives every layer", () => {
  /*
    `normalizeWorkspaceProfile` answers GENERAL to `null` and to the string
    "GENERAL" alike, and *four* separate places took that as licence to infer:

      1. `resolveEffectiveWorkspaceProfile`      (lib/workspaces.ts)
      2. `resolveWorkspaceProfileClaim`          (lib/auth-core/session-claims.ts)
      3. `resolveWorkspaceVerticalProductBundle` (lib/workspace-products.ts)
      4. the seeds, which never set a profile at all

    Each hid the next. Fixing (1) changed nothing, because (2) had already
    resolved the claim into the JWT. Fixing (2) changed nothing visible,
    because (3) computes the *label* and was still inferring on its own. Three
    rebuilds to find three layers of one mistake.

    This asserts the layers a unit test can reach. If a fifth ever appears,
    something here should go red.
  */

  const SERVICE_BUSINESS = [...FOUNDATIONAL, ...CRM_FEATURES];

  it("keeps its bundle when the profile is stated", () => {
    expect(
      resolveWorkspaceVerticalProductBundle({
        enabledFeatures: SERVICE_BUSINESS,
        workspaceProfile: "GENERAL",
      }).workspaceLabel,
    ).toBe("Sales & CRM");
  });

  it("keeps its bundle even holding the whole product", () => {
    // The condition that actually broke it: `seed-staging-tenant.ts` grants
    // everything, so there is a vertical to infer and it is not this tenant's.
    expect(
      resolveWorkspaceVerticalProductBundle({
        enabledFeatures: EVERYTHING,
        workspaceProfile: "GENERAL",
      }).workspaceLabel,
    ).toBe("Sales & CRM");
  });

  it("still infers a bundle when nothing was stated", () => {
    expect(
      resolveWorkspaceVerticalProductBundle({
        enabledFeatures: [...FOUNDATIONAL, ...SCHOOL_FEATURES],
        workspaceProfile: null,
      }).workspaceLabel,
    ).toBe("School Operations");
  });

  it("agrees with the sidebar, which is the layer above it", () => {
    // The bug was these two disagreeing: the profile resolved to GENERAL and
    // the label came back "School Operations".
    const bundle = resolveWorkspaceVerticalProductBundle({
      enabledFeatures: EVERYTHING,
      workspaceProfile: "GENERAL",
    });
    const sidebar = getWorkspaceSidebarModel({
      role: "SUPERADMIN",
      enabledFeatures: EVERYTHING,
      workspaceProfile: "GENERAL",
    });
    expect(sidebar.workspaceLabel).toBe(bundle.workspaceLabel);
  });
});
