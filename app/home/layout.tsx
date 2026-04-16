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
      "Replace spreadsheets and disconnected tools with one clearer system for daily work, reporting, and operational follow-through.",
    type: "website",
    siteName: PLATFORM_BRAND_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    description:
      "Corelith helps growing multi-site businesses run daily work, handoffs, and reporting from one clearer system.",
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
