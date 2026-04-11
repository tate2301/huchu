import type { MetadataRoute } from "next";
import { PLATFORM_APP_DESCRIPTION, PLATFORM_BRAND_NAME } from "@/lib/platform/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${PLATFORM_BRAND_NAME} Workspace`,
    short_name: PLATFORM_BRAND_NAME,
    description: PLATFORM_APP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
