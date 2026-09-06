/**
 * Breadcrumb labelling.
 *
 * These are pure functions over a pathname, so they are worth a test even
 * though the component around them is not: every detail route in the app ends
 * in a record id, and the top bar is where that shows.
 */

import { describe, it, expect } from "vitest";
import { buildCrumbs, getCurrentPageTitle } from "./breadcrumbs";

describe("buildCrumbs", () => {
  it("drops record ids rather than title-casing them", () => {
    const crumbs = buildCrumbs(
      "/schools/students/class/515bcc28-5300-49b9-8187-abf2f2d44988",
    );
    const labels = crumbs.map((crumb) => crumb.label);

    expect(labels).toEqual(["Home", "Schools", "Students", "Year group"]);
    // The failure this exists for: "515bcc28 5300 49b9 8187 Abf2f2d44988".
    expect(labels.some((label) => label.includes("515bcc28"))).toBe(false);
  });

  it("leaves ordinary segments alone", () => {
    expect(buildCrumbs("/schools/timetable").map((crumb) => crumb.label)).toEqual([
      "Home",
      "Schools",
      "Timetable",
    ]);
  });

  it("keeps segments that merely look hexadecimal", () => {
    // "decade" is all hex characters. Only the full UUID shape is an id.
    expect(buildCrumbs("/reports/decade").map((crumb) => crumb.label)).toEqual([
      "Home",
      "Reports",
      "Decade",
    ]);
  });

  it("titles a detail page from the list it came from", () => {
    expect(
      getCurrentPageTitle("/schools/students/8b1f3c2e-0000-4000-8000-000000000000"),
    ).toBe("Students");
  });
});
