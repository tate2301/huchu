import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/marketing/seo";

/**
 * Only the marketing surface is crawlable. Every authenticated area is
 * disallowed so tenant workspaces and the platform console stay out of search
 * results even if a URL leaks into a link somewhere.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/home", "/login"],
        disallow: [
          "/api/",
          "/admin/",
          "/portal/",
          "/settings/",
          "/dashboard",
          "/gold/",
          "/schools/",
          "/retail/",
          "/scrap-metal/",
          "/car-sales/",
          "/thrift/",
          "/stores/",
          "/people/",
          "/accounting/",
          "/maintenance/",
          "/compliance/",
          "/cctv/",
          "/management/",
          "/reports/",
          "/user-management/",
          "/attendance/",
          "/shift-report/",
          "/plant-report/",
          "/access-blocked",
          "/offline",
          "/status",
        ],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
