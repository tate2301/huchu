import type { Metadata } from "next";
import { seoPages } from "@/app/home/site-data";
import {
  PLATFORM_BRAND_NAME,
  PLATFORM_MARKETING_TAGLINE,
} from "@corelithzw/platform/brand";

export const metadata: Metadata = {
  title: {
    default: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    template: `%s | ${PLATFORM_BRAND_NAME}`,
  },
  description: seoPages.home.description,
  openGraph: {
    title: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    description: seoPages.home.description,
    type: "website",
    siteName: PLATFORM_BRAND_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`,
    description: seoPages.home.description,
  },
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
