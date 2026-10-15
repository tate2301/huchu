import * as React from "react";

import { ExploreLoading, ExplorePage } from "@/components/explore/explore-page";
import { NewQuestionStudio } from "@/components/explore/studio";

/** Explore (the ExploreStudio board): a new question, from `?sql=`, `?ask=` or nothing. */
export default function ExploreStudioPage() {
  // The question is read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<ExplorePage><ExploreLoading /></ExplorePage>}>
      <NewQuestionStudio />
    </React.Suspense>
  );
}
