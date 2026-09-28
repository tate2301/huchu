import { describe, expect, it } from "vitest";

import {
  buildSubmissionSchema,
  crmIntakeFormConfigSchema,
  parseIntakeFormConfig,
} from "@/lib/crm/intake-schema";

const config = {
  fields: [
    { key: "area_sqm", label: "Area (m²)", type: "number" as const, required: true },
    {
      key: "surface",
      label: "Surface",
      type: "select" as const,
      required: false,
      options: [
        { value: "concrete", label: "Concrete" },
        { value: "tile", label: "Tile" },
      ],
    },
  ],
  services: [
    { id: "logo-mat", label: "Logo mat" },
    { id: "entrance-mat", label: "Entrance mat" },
  ],
};

describe("crmIntakeFormConfigSchema", () => {
  it("accepts a valid config", () => {
    expect(() => crmIntakeFormConfigSchema.parse(config)).not.toThrow();
  });

  it("rejects a select field with no options", () => {
    const bad = {
      fields: [{ key: "surface", label: "Surface", type: "select", required: true }],
      services: [],
    };
    expect(() => crmIntakeFormConfigSchema.parse(bad)).toThrow();
  });

  it("rejects a non-snake_case field key", () => {
    const bad = {
      fields: [{ key: "Area SqM", label: "Area", type: "text" }],
      services: [],
    };
    expect(() => crmIntakeFormConfigSchema.parse(bad)).toThrow();
  });

  it("parseIntakeFormConfig tolerates null json", () => {
    expect(parseIntakeFormConfig(null, null)).toEqual({ fields: [], services: [] });
  });

  it("rejects duplicate field keys", () => {
    const bad = {
      fields: [
        { key: "area", label: "Area A", type: "text" },
        { key: "area", label: "Area B", type: "text" },
      ],
      services: [],
    };
    expect(() => crmIntakeFormConfigSchema.parse(bad)).toThrow(/Two questions save to/);
  });

  it("offers the app's full question vocabulary, not a separate one", () => {
    const richer = {
      fields: [
        { key: "work_email", label: "Work email", type: "email", required: true },
        { key: "urgency", label: "How urgent", type: "rating", required: false, max: 5 },
        { key: "site_plan", label: "Site plan", type: "file", required: false },
      ],
      services: [],
    };
    expect(() => crmIntakeFormConfigSchema.parse(richer)).not.toThrow();
  });

  it("no longer knows intake's old type names — the migration renames them", () => {
    for (const type of ["textarea", "multiselect"]) {
      const old = { fields: [{ key: "a", label: "A", type, required: false }], services: [] };
      expect(() => crmIntakeFormConfigSchema.parse(old)).toThrow();
    }
  });

  it("holds an intake form to 40 questions", () => {
    const fields = Array.from({ length: 41 }, (_, index) => ({
      key: `q_${index}`,
      label: `Question ${index}`,
      type: "text",
      required: false,
    }));
    expect(() => crmIntakeFormConfigSchema.parse({ fields, services: [] })).toThrow(/up to 40/);
  });

  it("rejects duplicate service ids", () => {
    const bad = {
      fields: [],
      services: [
        { id: "mat", label: "Mat A" },
        { id: "mat", label: "Mat B" },
      ],
    };
    expect(() => crmIntakeFormConfigSchema.parse(bad)).toThrow(/Duplicate service id/);
  });
});

describe("buildSubmissionSchema", () => {
  const schema = buildSubmissionSchema(parseIntakeFormConfig(config.fields, config.services));

  it("accepts a valid submission", () => {
    const parsed = schema.parse({
      contactName: "Jane Doe",
      phone: "+263771234567",
      selectedServices: ["logo-mat"],
      answers: { area_sqm: 12, surface: "tile" },
      utmSource: "facebook",
    });
    expect(parsed.contactName).toBe("Jane Doe");
    expect(parsed.answers.area_sqm).toBe(12);
  });

  it("rejects a missing required custom field", () => {
    expect(() =>
      schema.parse({ contactName: "Jane", answers: { surface: "tile" } }),
    ).toThrow();
  });

  it("rejects an unknown answer key", () => {
    expect(() =>
      schema.parse({ contactName: "Jane", answers: { area_sqm: 5, bogus: "x" } }),
    ).toThrow();
  });

  it("rejects an unlisted service", () => {
    expect(() =>
      schema.parse({ contactName: "Jane", selectedServices: ["not-a-service"], answers: { area_sqm: 5 } }),
    ).toThrow();
  });

  it("rejects an answer outside the question's choices", () => {
    expect(() =>
      schema.parse({ contactName: "Jane", answers: { area_sqm: 5, surface: "marble" } }),
    ).toThrow();
  });

  it("rejects a filled honeypot", () => {
    expect(() =>
      schema.parse({ contactName: "Jane", website: "http://spam", answers: { area_sqm: 5 } }),
    ).toThrow();
  });
});
