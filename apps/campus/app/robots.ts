import type { MetadataRoute } from "next";

/** A workspace host: nothing on it is for a crawler. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
