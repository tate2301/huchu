import type { MetadataRoute } from "next";

import { segments } from "@/app/home/site-data";
import { absoluteUrl } from "@/lib/marketing/seo";

/**
 * Public marketing surface only. Authenticated app routes are intentionally
 * excluded — they are behind auth and must never appear in the index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes: Array<{
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }> = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/home", priority: 0.9, changeFrequency: "weekly" },
    { path: "/home/products", priority: 0.9, changeFrequency: "weekly" },
    { path: "/home/pricing", priority: 0.9, changeFrequency: "weekly" },
    { path: "/home/schools", priority: 0.85, changeFrequency: "monthly" },
    { path: "/home/solutions", priority: 0.8, changeFrequency: "monthly" },
    { path: "/home/implementation-support", priority: 0.7, changeFrequency: "monthly" },
    { path: "/home/founding-partner", priority: 0.8, changeFrequency: "monthly" },
    // Free tools are the top-of-funnel search surface, so they index at the
    // same weight as the pages they feed.
    { path: "/home/tools", priority: 0.8, changeFrequency: "monthly" },
    { path: "/home/tools/fiscalisation-penalty", priority: 0.85, changeFrequency: "monthly" },
    { path: "/home/tools/vat-threshold", priority: 0.85, changeFrequency: "monthly" },
    { path: "/home/book-demo", priority: 0.9, changeFrequency: "monthly" },
    { path: "/home/about", priority: 0.5, changeFrequency: "yearly" },
    { path: "/home/contact", priority: 0.6, changeFrequency: "yearly" },
    { path: "/home/faq", priority: 0.6, changeFrequency: "monthly" },
    { path: "/home/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/home/terms", priority: 0.3, changeFrequency: "yearly" },
  ];

  const segmentRoutes = segments.map((segment, index) => ({
    path: `/home/solutions/${segment.slug}`,
    priority: index === 0 ? 0.9 : 0.75,
    changeFrequency: "monthly" as const,
  }));

  return [...staticRoutes, ...segmentRoutes].map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
