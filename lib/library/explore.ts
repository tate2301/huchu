import { templateBySlug, type ExploreEngine, type ExploreTemplate } from "@/lib/explore/templates";
import { checkSql } from "@/lib/reports/sql/guard";

import { libraryFor } from "./reach";
import { explorePayloadSchema } from "./report-kinds";

/**
 * Corelith's Explore questions from the library, from a workspace's side:
 * the published ones that reach it, offered beside the templates in code
 * (`EXPLORE_TEMPLATES`) and filtered the same way — only to someone who
 * reads every table one reads. A template in code keeps its address, over
 * either engine. A library question is written over the report sources (it
 * has no version over the real tables), so `readable` is the report sources'
 * SQL names and each one runs over the sources, whichever engine the
 * workspace runs Explore on.
 */
export async function libraryExploreTemplates(
  companyId: string,
  readable: ReadonlySet<string>,
): Promise<Array<ExploreTemplate & { reads: string[]; engine: ExploreEngine }>> {
  const items = await libraryFor(companyId, "EXPLORE");
  return items.flatMap((item) => {
    if (templateBySlug(item.key, "sources") || templateBySlug(item.key, "tables")) return [];
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
        engine: "sources" as const,
      },
    ];
  });
}
