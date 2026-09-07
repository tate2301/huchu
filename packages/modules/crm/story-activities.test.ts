import { describe, it, expect } from "vitest";
import { activityEvents } from "./story";

const base = { occurredAt: "2026-07-29T03:07:00.000Z", createdBy: { id: "u1", name: "JN" } };

describe("activityEvents", () => {
  it("renders a legacy note through the body, not as a plain-text subject", () => {
    // Everything logged before the composer stopped splitting on the first
    // newline has its prose in `subject` — those rows printed the raw token.
    const [event] = activityEvents([
      {
        id: "a1",
        type: "NOTE",
        subject: "@[James Nyabadza](534a7770-d36c-4d68-adb9-3ae22514b8d1) check the website",
        body: null,
        ...base,
      },
    ]);
    expect(event.title).toBe("Note");
    expect(event.body).toContain("@[James Nyabadza]");
  });

  it("does not print a written note twice", () => {
    const [event] = activityEvents([
      { id: "a2", type: "CALL", subject: "Rang about the quote", body: "Rang about the quote", ...base },
    ]);
    expect(event.title).toBe("Call");
    expect(event.body).toBe("Rang about the quote");
  });

  it("leaves a generated entry as the one-liner it is", () => {
    const [event] = activityEvents([
      { id: "a3", type: "STAGE_CHANGE", subject: "Moved to Quoted", body: null, ...base },
    ]);
    expect(event.title).toBe("Moved to Quoted");
    expect(event.body).toBeNull();
  });
});
