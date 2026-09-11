import { describe, expect, it } from "vitest";

import { humanizeFieldName, mapLeadFields } from "./field-mapping";

describe("mapLeadFields", () => {
  it("maps Meta's standard field names onto a contactable lead", () => {
    const mapped = mapLeadFields([
      { name: "full_name", values: ["Tariro Moyo"] },
      { name: "email", values: ["tariro@example.com"] },
      { name: "phone_number", values: ["+263771234567"] },
    ]);

    expect(mapped.contactName).toBe("Tariro Moyo");
    expect(mapped.email).toBe("tariro@example.com");
    expect(mapped.phone).toBe("+263771234567");
    expect(mapped.message).toBeNull();
  });

  it("builds a name from first and last when the form asks for them separately", () => {
    const mapped = mapLeadFields([
      { name: "first_name", values: ["Tariro"] },
      { name: "last_name", values: ["Moyo"] },
    ]);
    expect(mapped.contactName).toBe("Tariro Moyo");
  });

  it("falls back to the email, then the phone, rather than creating a nameless lead", () => {
    expect(mapLeadFields([{ name: "email", values: ["a@b.com"] }]).contactName).toBe("a@b.com");
    expect(mapLeadFields([{ name: "phone_number", values: ["+263771234567"] }]).contactName).toBe(
      "+263771234567",
    );
    expect(mapLeadFields([]).contactName).toBe("Facebook lead");
  });

  it("keeps custom questions instead of dropping them", () => {
    const mapped = mapLeadFields([
      { name: "full_name", values: ["Tariro Moyo"] },
      { name: "what_service_do_you_need?", values: ["Borehole drilling"] },
      { name: "when_do_you_want_to_start?", values: ["This month"] },
    ]);

    expect(mapped.answers["What service do you need?"]).toBe("Borehole drilling");
    expect(mapped.message).toBe(
      "What service do you need? — Borehole drilling\nWhen do you want to start? — This month",
    );
  });

  it("joins a multi-select answer rather than keeping only the first choice", () => {
    const mapped = mapLeadFields([{ name: "services", values: ["Drilling", "Casing"] }]);
    expect(mapped.answers.Services).toBe("Drilling, Casing");
  });

  it("collapses the address parts into one line", () => {
    const mapped = mapLeadFields([
      { name: "street_address", values: ["12 Samora Machel Ave"] },
      { name: "city", values: ["Harare"] },
      { name: "country", values: ["Zimbabwe"] },
    ]);
    expect(mapped.address).toBe("12 Samora Machel Ave, Harare, Zimbabwe");
    // Address parts are standard fields, so they do not also appear as prose.
    expect(mapped.message).toBeNull();
  });

  it("ignores empty answers and unnamed fields", () => {
    const mapped = mapLeadFields([
      { name: "email", values: [""] },
      { name: "", values: ["orphan"] },
      { name: "full_name", values: ["  Tariro  "] },
    ]);
    expect(mapped.email).toBeNull();
    expect(mapped.contactName).toBe("Tariro");
    expect(Object.keys(mapped.answers)).toEqual(["Full name"]);
  });

  it("is case-insensitive about Meta's field names", () => {
    expect(mapLeadFields([{ name: "EMAIL", values: ["a@b.com"] }]).email).toBe("a@b.com");
  });
});

describe("humanizeFieldName", () => {
  it("turns a slug back into something a rep can read", () => {
    expect(humanizeFieldName("what_service_do_you_need?")).toBe("What service do you need?");
    expect(humanizeFieldName("phone_number")).toBe("Phone number");
  });
});
