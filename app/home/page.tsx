import { LandingPage } from "@/components/marketing/landing-page";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Avenra" },
  description:
    "Avenra is a multi-site operations platform with shared control, finance integrity, and vertical packs.",
};

export default function MarketingHomePage() {
  const config = getMarketingSiteConfig();

  return <LandingPage config={config} />;
}
