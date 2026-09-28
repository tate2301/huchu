/**
 * The strict half of the codec: what a saved view is allowed to hold.
 *
 * The address bar is read leniently — a mangled link narrows nothing rather
 * than failing — but a view is written once and read by everyone it is
 * shared with, so it is checked on the way in: every filter is one this list
 * has, every answer is the right shape, every column exists.
 */
import { z } from "zod";

import { DATE_PRESETS, isCustomFieldKey, type FilterDef, type RegisterDef, type ViewState } from "./types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function filterValueSchema(filter: FilterDef) {
  switch (filter.kind) {
    case "boolean":
      return z.literal(true);
    case "date": {
      const presets = (filter.presets ?? DATE_PRESETS) as readonly string[];
      return z.union([
        z.object({ preset: z.enum(DATE_PRESETS).refine((value) => presets.includes(value)) }).strict(),
        z
          .object({ from: day.optional(), to: day.optional() })
          .strict()
          .refine((range) => Boolean(range.from || range.to)),
      ]);
    }
    case "number":
      return z
        .object({ min: z.number().finite().optional(), max: z.number().finite().optional() })
        .strict()
        .refine((range) => range.min !== undefined || range.max !== undefined);
    default: {
      const allowed = filter.kind === "enum" && filter.options ? filter.options.map((o) => o.value) : null;
      const item = z
        .string()
        .trim()
        .min(1)
        .max(120)
        .refine((value) => (allowed ? allowed.includes(value) : true), "Not one of this filter's answers");
      return z.array(item).min(1).max(filter.single ? 1 : 50);
    }
  }
}

export function viewStateSchema(def: RegisterDef) {
  const byKey = new Map(def.filters.map((filter) => [filter.key, filter]));
  const customValue = z.array(z.string().trim().min(1).max(120)).min(1).max(50);
  const columnIds = def.columns.filter((column) => !column.exportOnly).map((column) => column.id);

  return z
    .object({
      q: z.string().trim().max(200).optional(),
      filters: z.record(z.string(), z.unknown()).superRefine((filters, ctx) => {
        for (const [key, value] of Object.entries(filters)) {
          const filter = byKey.get(key);
          const schema = filter ? filterValueSchema(filter) : isCustomFieldKey(key) ? customValue : null;
          if (!schema) {
            ctx.addIssue({ code: "custom", message: `This list has no "${key}" filter`, path: [key] });
            continue;
          }
          const parsed = schema.safeParse(value);
          if (!parsed.success) {
            ctx.addIssue({ code: "custom", message: `"${key}" is not a usable answer`, path: [key] });
          }
        }
      }),
      sort: z
        .object({
          key: z.string().refine((key) => def.sorts.some((sort) => sort.key === key), "Not a sort this list has"),
          dir: z.enum(["asc", "desc"]),
        })
        .strict()
        .optional(),
      layout: z.enum(def.layouts as unknown as [string, ...string[]]).optional(),
      by: z
        .string()
        .refine((key) => Boolean(def.groupBys?.some((group) => group.key === key)), "Not a grouping this list has")
        .optional(),
      columns: z
        .array(z.string().refine((id) => columnIds.includes(id), "Not a column this list has"))
        .max(60)
        .refine((ids) => new Set(ids).size === ids.length, "A column is listed twice")
        .optional(),
    })
    .strict() as unknown as z.ZodType<ViewState>;
}
