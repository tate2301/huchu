/**
 * The catalogue of operations, as a builder or an integration reads it: every
 * operation has a unique key under its product, a name, a risk, inputs that
 * read as JSON Schema (what Claude and an integration are shown), fields that
 * are among its inputs, and its own checks. An integration reaches only the
 * operations it names.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { integrationUses, operationsFor, type Integration } from "@/lib/integrations/types";
import { INTEGRATIONS } from "@/lib/integrations/registry";

import { OPERATIONS } from "./registry";

const RISKS = ["change", "send", "money", "access"];

describe("the operations catalogue", () => {
  it("names each operation once, under its product", () => {
    const keys = OPERATIONS.map((operation) => operation.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const operation of OPERATIONS) {
      expect(operation.key, operation.key).toMatch(/^[a-z]+\.[a-z_]+\.[a-z_]+$/);
      expect(operation.key.startsWith(`${operation.product}.`), operation.key).toBe(true);
      expect(operation.name.length, operation.key).toBeGreaterThan(3);
      expect(operation.description.length, operation.key).toBeGreaterThan(40);
      expect(RISKS, operation.key).toContain(operation.risk);
    }
  });

  it("gives every operation inputs that read as JSON Schema, and fields among them", () => {
    for (const operation of OPERATIONS) {
      const schema = z.toJSONSchema(operation.input as z.ZodType) as { properties?: Record<string, unknown> };
      expect(schema.properties, operation.key).toBeDefined();
      for (const field of [...operation.fields.map((row) => row.name), ...(operation.pageFields ?? [])]) {
        expect(Object.keys(schema.properties!), `${operation.key}: ${field}`).toContain(field);
      }
    }
  });

  it("holds what Vane can now create and send", () => {
    expect(OPERATIONS.map((operation) => operation.key)).toEqual(
      expect.arrayContaining([
        "crm.quote.create",
        "crm.invoice.create",
        "crm.receipt.record",
        "crm.lead.create",
        "crm.email.send",
        "crm.document.email",
        "people.permission.set",
        "retail.promotion.create",
      ]),
    );
  });
});

describe("integrations", () => {
  const partner: Integration = { key: "tiles", name: "Tile Calc", maker: "Tile Calc Ltd", summary: "Works out tiles from a plan.", uses: ["crm.quote.create", "crm.lead.*"], runs: "on-approval" };

  it("reach only the operations they name, by key or by a product's prefix", () => {
    expect(integrationUses(partner, "crm.quote.create")).toBe(true);
    expect(integrationUses(partner, "crm.lead.create")).toBe(true);
    expect(integrationUses(partner, "crm.lead.stage")).toBe(true);
    expect(integrationUses(partner, "crm.invoice.create")).toBe(false);
    expect(integrationUses(partner, "crm.leadership.x")).toBe(false);
    expect(operationsFor(partner).map((operation) => operation.key).sort()).toEqual(["crm.lead.create", "crm.lead.stage", "crm.quote.create"]);
  });

  it("start with Vane, which may use every operation and asks a person each time", () => {
    expect(INTEGRATIONS.map((integration) => integration.key)).toEqual(["vane"]);
    expect(INTEGRATIONS[0]).toMatchObject({ maker: "Corelith", uses: ["*"], runs: "on-approval" });
    expect(operationsFor(INTEGRATIONS[0]!)).toHaveLength(OPERATIONS.length);
  });
});
