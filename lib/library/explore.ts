import { templateBySlug, type ExploreTemplate } from "@/lib/explore/templates";
import { checkSql } from "@/lib/reports/sql/guard";

import { libraryFor } from "./reach";
import { explorePayloadSchema } from "./report-kinds";

/**
 * Corelith's Explore questions from the library, from a workspace's side:
 * the published ones that reach it, offered beside the templates in code
 * (`EXPLORE_TEMPLATES`) and filtered the same way — only to someone who
 * reads every table one reads. A template in code keeps its address.
 */
export async function libraryExploreTemplates(companyId: string, readable: ReadonlySet<string>): Promise<Array<ExploreTemplate & { reads: string[] }>> {
  const items = await libraryFor(companyId, "EXPLORE");
  return items.flatMap((item) => {
    if (templateBySlug(item.key)) return [];
    const parsed = explorePayloadSchema.safeParse(item.payload);
    if (!parsed.success) return [];
    const checked = checkSql(parsed.data.sql, readable);
    if (!checked.ok) return [];
    return [
      {
        slug: item.key,
        title: item.title,
        answers: parsed.data.answers,
        product: parsed.data.product,
        ...(parsed.data.noun ? { noun: parsed.data.noun } : {}),
        madeBy: "Corelith" as const,
        sql: parsed.data.sql,
        reads: checked.tables,
      },
    ];
  });
}
