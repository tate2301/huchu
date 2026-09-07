export type MarketingSiteConfig = {
  schedulerUrl: string | null;
  schedulerHref: string;
  schedulerExternal: boolean;
  demoWebhookUrl: string | null;
};

const DEFAULT_SCHEDULER_FALLBACK = "/home/book-demo#demo-form";

function normalizeEnvUrl(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function isExternalUrl(value: string) {
  return /^(https?:)?\/\//i.test(value) || value.startsWith("mailto:") || value.startsWith("tel:");
}

export function getMarketingSchedulerUrl() {
  return (
    normalizeEnvUrl(process.env.NEXT_PUBLIC_MARKETING_DEMO_SCHEDULER_URL) ||
    normalizeEnvUrl(process.env.MARKETING_DEMO_SCHEDULER_URL)
  );
}

export function getMarketingDemoWebhookUrl() {
  return (
    normalizeEnvUrl(process.env.MARKETING_DEMO_WEBHOOK_URL) ||
    normalizeEnvUrl(process.env.NEXT_PUBLIC_MARKETING_DEMO_WEBHOOK_URL)
  );
}

export function getMarketingSiteConfig(): MarketingSiteConfig {
  const schedulerUrl = getMarketingSchedulerUrl();
  const schedulerHref = schedulerUrl ?? DEFAULT_SCHEDULER_FALLBACK;

  return {
    schedulerUrl,
    schedulerHref,
    schedulerExternal: isExternalUrl(schedulerHref),
    demoWebhookUrl: getMarketingDemoWebhookUrl(),
  };
}
