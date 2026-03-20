import { LandingPage } from "@/components/marketing/landing-page";
import { getMarketingSiteConfig } from "@/lib/marketing-site";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Avenra",
  description:
    "Avenra is a multi-site operations and finance platform with vertical packs, transparent pricing, and tailored demo booking.",
};

export default function MarketingHomePage() {
  const config = getMarketingSiteConfig();

  return <LandingPage config={config} />;
}
