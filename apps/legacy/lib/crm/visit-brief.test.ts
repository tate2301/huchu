import { describe, it, expect } from "vitest";
import {
  briefChecklist,
  briefWhere,
  buildVisitBrief,
  isBriefExpired,
} from "./visit-brief";

const base = {
  appointmentNo: "SVT-0014",
  title: "Measure the roof",
  scheduledStart: "2026-08-04T06:00:00.000Z",
  scheduledEnd: null,
  location: null,
  latitude: null,
  longitude: null,
  briefExpiresAt: null,
  assignedTo: { name: "James Nyabadza" },
  site: null,
  client: { name: "Hurudza Labs" },
  checklist: null,
};

describe("the public visit brief", () => {
  it("reads the site as one line a driver can be told", () => {
    expect(
      briefWhere({
        ...base,
        site: { name: "Warehouse 3", addressLine: "12 Sam Nujoma", city: "Harare" },
      }),
    ).toBe("Warehouse 3, 12 Sam Nujoma, Harare");
  });

  it("falls back to the typed location when the visit is not at a recorded site", () => {
    expect(briefWhere({ ...base, location: "  Corner shop, Chitungwiza " }))
      .toBe("Corner shop, Chitungwiza");
  });

  it("carries checklist labels but never the team's notes on them", () => {
    const labels = briefChecklist([
      { key: "ladder", label: "Bring the long ladder", checked: false, notes: "the one that isn't bent" },
      { key: "meter", label: "Damp meter", checked: true },
      { nonsense: true },
    ]);
    expect(labels).toEqual(["Bring the long ladder", "Damp meter"]);
    expect(JSON.stringify(labels)).not.toContain("bent");
  });

  it("offers a map only when the place is actually pinned", () => {
    expect(buildVisitBrief(base).mapUrl).toBeNull();
    expect(buildVisitBrief({ ...base, latitude: -17.82, longitude: 31.05 }).mapUrl)
      .toContain("-17.82,31.05");
  });

  it("treats a link with no expiry as one that still stands", () => {
    expect(isBriefExpired(null)).toBe(false);
    expect(isBriefExpired("2020-01-01T00:00:00.000Z")).toBe(true);
    expect(isBriefExpired("2999-01-01T00:00:00.000Z")).toBe(false);
  });

  it("does not leak the deal's value — the brief has no field for it", () => {
    const brief = buildVisitBrief(base);
    expect(Object.keys(brief)).not.toContain("value");
    expect(JSON.stringify(brief)).not.toMatch(/value|margin|probability/i);
  });
});
