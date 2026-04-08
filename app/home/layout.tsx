import type { Metadata } from "next";
import {
  PLATFORM_BRAND_NAME,
  PLATFORM_MARKETING_DESCRIPTION,
  PLATFORM_MARKETING_TAGLINE,
} from "@/lib/platform/brand";

export const metadata: Metadata = {
  title: {
    default: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    template: `%s | ${PLATFORM_BRAND_NAME}`,
  },
  description: PLATFORM_MARKETING_DESCRIPTION,
  openGraph: {
    title: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    description:
      "Run sector-specific workflows on shared accounting, reporting, branding, and administration rails instead of stitching together separate systems.",
    type: "website",
    siteName: PLATFORM_BRAND_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    description:
      "One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.",
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
