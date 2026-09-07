import { describe, it, expect } from "vitest";

import { referenceHref } from "@corelithzw/module-records/rich-text";

// Where a reference in a comment sends the reader: the record registry's
// answer, so a route change moves the mention with the page rather than
// leaving a link that 404s. The registry reads this host's manifests (the
// CRM's and the school's record types), which is why the test lives here.
const USER = "11111111-1111-4111-8111-111111111111";

describe("referenceHref", () => {
  it("sends a person mention to the rep page, not the contact page", () => {
    // A mention is a colleague; a person reference is a customer contact. They
    // are different records and the same id would open the wrong one.
    expect(referenceHref({ kind: "user", id: USER, label: "Ada" })).toBe(`/crm/reps/${USER}`);
    expect(referenceHref({ kind: "person", id: USER, label: "Ada" })).toBe(
      `/crm/people/${USER}`,
    );
  });

  it("sends a school reference to the record page S-4.3 built", () => {
    expect(referenceHref({ kind: "student", id: USER, label: "Tendai" })).toBe(
      `/schools/students/${USER}`,
    );
    expect(referenceHref({ kind: "class", id: USER, label: "Form 2 Blue" })).toBe(
      `/management/master-data/schools/classes/${USER}`,
    );
  });
});
