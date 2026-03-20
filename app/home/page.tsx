import { LandingPage } from "@/components/marketing/landing-page";
import { getMarketingSiteConfig } from "@/lib/marketing-site";

export default function MarketingHomePage() {
  const config = getMarketingSiteConfig();

  return <LandingPage config={config} />;
}
