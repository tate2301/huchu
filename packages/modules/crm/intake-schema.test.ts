import { describe, expect, it } from "vitest";

import {
  buildSubmissionSchema,
  crmIntakeFormConfigSchema,
  parseIntakeFormConfig,
} from "./intake-schema";

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
    expect(() => crmIntakeFormConfigSchema.parse(bad)).toThrow(/Duplicate field key/);
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

  it("rejects a filled honeypot", () => {
    expect(() =>
      schema.parse({ contactName: "Jane", website: "http://spam", answers: { area_sqm: 5 } }),
    ).toThrow();
  });
});
