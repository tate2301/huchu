import { describe, expect, it } from "vitest";

import { pickAssignee, type AssignmentCandidate } from "./assignment";
import { scoreLead } from "./lead-scoring";

const NOW = new Date("2026-03-10T12:00:00Z");

describe("scoreLead", () => {
  it("leaves a bare lead cold rather than guessing something flattering", () => {
    // A name typed into a box scores the two points that being typed in is
    // worth, and nothing else.
    const score = scoreLead({}, NOW);
    expect(score.total).toBeLessThan(5);
    expect(score.band).toBe("COLD");
  });

  it("explains every point it gives", () => {
    const score = scoreLead(
      { estimatedValue: 25_000, contactPhone: "+263771234567", clientId: "c-1" },
      NOW,
    );
    const sum = score.signals.reduce((total, signal) => total + signal.points, 0);
    expect(score.total).toBe(sum);
    expect(score.signals.map((signal) => signal.key)).toEqual([
      "value",
      "contactable",
      "known_company",
      "channel",
    ]);
  });

  it("ranks a form submission above a manually typed name", () => {
    const base = { estimatedValue: 5_000, contactPhone: "+263771234567" };
    const form = scoreLead({ ...base, sourceChannel: "WEB_FORM" as const }, NOW);
    const manual = scoreLead({ ...base, sourceChannel: "MANUAL" as const }, NOW);
    expect(form.total).toBeGreaterThan(manual.total);
  });

  it("caps engagement so a dead lead can't be talked into the top of the list", () => {
    const chatty = scoreLead({ activityCount: 40 }, NOW);
    const busy = scoreLead({ activityCount: 5 }, NOW);
    expect(chatty.total).toBe(busy.total);
  });

  it("never goes above 100 or below 0", () => {
    const everything = scoreLead(
      {
        estimatedValue: 500_000,
        contactEmail: "a@b.com",
        contactPhone: "+263771234567",
        clientId: "c-1",
        services: ["install"],
        sourceChannel: "REFERRAL" as const,
        activityCount: 10,
        appointmentCount: 2,
        documentCount: 1,
        createdAt: new Date("2026-03-10T09:00:00Z"),
        firstContactAt: new Date("2026-03-10T09:30:00Z"),
      },
      NOW,
    );
    expect(everything.total).toBeLessThanOrEqual(100);
    expect(everything.band).toBe("HOT");

    const neglected = scoreLead({ createdAt: new Date("2025-01-01T00:00:00Z") }, NOW);
    expect(neglected.total).toBe(0);
  });

  it("docks a lead nobody has contacted, and says so", () => {
    const lead = { estimatedValue: 25_000, contactPhone: "+263771234567" };
    const fresh = scoreLead({ ...lead, createdAt: new Date("2026-03-09T00:00:00Z") }, NOW);
    const forgotten = scoreLead({ ...lead, createdAt: new Date("2026-01-01T00:00:00Z") }, NOW);

    expect(forgotten.total).toBeLessThan(fresh.total);
    expect(forgotten.signals.some((signal) => signal.key === "stale")).toBe(true);
  });

  it("rewards a fast first response more than a slow one", () => {
    const created = new Date("2026-03-10T09:00:00Z");
    const quick = scoreLead(
      { createdAt: created, firstContactAt: new Date("2026-03-10T09:30:00Z") },
      NOW,
    );
    const sameDay = scoreLead(
      { createdAt: created, firstContactAt: new Date("2026-03-10T20:00:00Z") },
      NOW,
    );
    expect(quick.total).toBeGreaterThan(sameDay.total);
  });
});

describe("pickAssignee", () => {
  const team: AssignmentCandidate[] = [
    { id: "a", name: "Ama", openLeads: 4 },
    { id: "b", name: "Ben", openLeads: 1 },
    { id: "c", name: "Chi", openLeads: 7 },
  ];

  it("gives the lead to whoever has the least on", () => {
    const decision = pickAssignee(team);
    expect(decision.userId).toBe("b");
    expect(decision.reason).toContain("fewest open leads");
  });

  it("skips anyone who is away", () => {
    const decision = pickAssignee([
      { id: "b", name: "Ben", openLeads: 1, unavailable: true },
      { id: "a", name: "Ama", openLeads: 4 },
    ]);
    expect(decision.userId).toBe("a");
  });

  it("assigns nobody rather than someone who is off", () => {
    const decision = pickAssignee([{ id: "b", name: "Ben", openLeads: 1, unavailable: true }]);
    expect(decision.userId).toBeNull();
    expect(decision.reason).toContain("available");
  });

  it("moves to the next person in the rotation", () => {
    expect(pickAssignee(team, { strategy: "ROUND_ROBIN", lastAssignedId: "a" }).userId).toBe("b");
    expect(pickAssignee(team, { strategy: "ROUND_ROBIN", lastAssignedId: "c" }).userId).toBe("a");
    expect(pickAssignee(team, { strategy: "ROUND_ROBIN" }).userId).toBe("a");
  });

  it("breaks ties the same way every time, so two servers agree", () => {
    const tied: AssignmentCandidate[] = [
      { id: "z", name: "Zoe", openLeads: 2 },
      { id: "a", name: "Ama", openLeads: 2 },
    ];
    expect(pickAssignee(tied).userId).toBe("a");
    expect(pickAssignee([...tied].reverse()).userId).toBe("a");
  });

  it("hands nothing out when the workspace assigns by hand", () => {
    expect(pickAssignee(team, { strategy: "MANUAL" }).userId).toBeNull();
  });
});
