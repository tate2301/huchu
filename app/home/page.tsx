import { LandingPage } from "@/components/marketing/landing-page";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import { PLATFORM_BRAND_NAME, PLATFORM_MARKETING_HOME_DESCRIPTION } from "@/lib/platform/brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: PLATFORM_BRAND_NAME },
  description: PLATFORM_MARKETING_HOME_DESCRIPTION,
};

export default function MarketingHomePage() {
  const config = getMarketingSiteConfig();

  return <LandingPage config={config} />;
}
