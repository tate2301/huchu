import type { MetadataRoute } from "next";
import { PLATFORM_APP_DESCRIPTION, PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import {
  buildWorkspaceIconHref,
  resolveWorkspaceIdentityFromRequestHeaders,
} from "@/lib/platform/workspace-identity";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const identity = await resolveWorkspaceIdentityFromRequestHeaders();
  const isWorkspaceInstall = Boolean(identity.companyId);

  return {
    name: isWorkspaceInstall
      ? `${identity.workspaceName} Workspace`
      : `${PLATFORM_BRAND_NAME} Workspace`,
    short_name: isWorkspaceInstall ? identity.shortName : PLATFORM_BRAND_NAME,
    description: isWorkspaceInstall
      ? `${identity.workspaceName} workspace on ${PLATFORM_BRAND_NAME}.`
      : PLATFORM_APP_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: identity.backgroundColor,
    orientation: "any",
    categories: ["business", "productivity"],
    icons: [
      {
        src: buildWorkspaceIconHref(identity, { size: 192 }),
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: buildWorkspaceIconHref(identity, { size: 512 }),
        sizes: "512x512",
        type: "image/svg+xml",
      },
      {
        src: buildWorkspaceIconHref(identity, { size: 192, purpose: "maskable" }),
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: buildWorkspaceIconHref(identity, { size: 512, purpose: "maskable" }),
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
