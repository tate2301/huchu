import * as React from "react";

import { ExploreLoading, ExplorePage } from "@/components/explore/explore-page";
import { Studio } from "@/components/explore/studio";

/** A question in Explore: a saved one by its id, or a template by its slug (`/explore/q/open-quotes`). */
export default async function ExploreQuestionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <React.Suspense fallback={<ExplorePage><ExploreLoading /></ExplorePage>}>
      <Studio key={slug} slug={slug} />
    </React.Suspense>
  );
}
