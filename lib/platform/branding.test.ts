import { describe, expect, it } from "vitest";

import {
  BRANDING_FONT_OPTIONS,
  type EffectiveBranding,
  getBrandingCssVariables,
} from "@/lib/platform/branding";

/**
 * A tenant's colour no longer re-tints the interface (98-decisions,
 * foundations question 3): the product theme does. `getBrandingCssVariables`
 * lands inline on `<body>`, where it would outrank every theme block in
 * `app/themes/roles.css`, so it may carry the typeface and nothing else.
 */
function branding(overrides: Partial<EffectiveBranding>): EffectiveBranding {
  return {
    companyId: "company",
    companyName: "Harare Bottle Store",
    displayName: "Harare Bottle Store",
    fontFamilyKey: "huchu",
    fontFamily: BRANDING_FONT_OPTIONS[0].fontFamily,
    brandingEnabled: true,
    customDomainEnabled: false,
    logoUrl: null,
    colors: { primary: "#c0392b", secondary: "#fdecea", accent: "#fbe8ec" },
    ...overrides,
  };
}

describe("getBrandingCssVariables", () => {
  it("emits no colour, whatever the tenant chose", () => {
    const other = BRANDING_FONT_OPTIONS.find((option) => option.key !== "huchu")!;
    const vars = getBrandingCssVariables(
      branding({ fontFamilyKey: other.key, fontFamily: other.fontFamily }),
    );
    expect(Object.keys(vars)).toEqual(["--font-sans"]);
    expect(vars["--font-sans"]).toBe(other.fontFamily);
  });

  it("is empty on the default face, so --font-sans never refers to itself", () => {
    expect(getBrandingCssVariables(branding({}))).toEqual({});
  });

  it("is empty with branding off", () => {
    const other = BRANDING_FONT_OPTIONS.find((option) => option.key !== "huchu")!;
    expect(
      getBrandingCssVariables(
        branding({ brandingEnabled: false, fontFamilyKey: other.key, fontFamily: other.fontFamily }),
      ),
    ).toEqual({});
  });
});
