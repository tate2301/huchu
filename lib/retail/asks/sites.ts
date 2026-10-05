import type { Ask } from "@/lib/workspace/ask";

/** A site's "Close this site" (10-setup 5.4, inferred from the ASKS pattern). */
export function closeSiteAsk(name: string): Ask {
  return {
    title: `Close ${name}?`,
    body: "Its tills stop and it leaves every list and filter. Its sales, stock history and reports stay. You can find it under State: Closed.",
    keep: "Keep it open",
    go: "Close the site",
    fill: "bad",
  };
}
