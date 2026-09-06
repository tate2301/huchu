import type { Metadata } from "next";

import {
  PLATFORM_BRAND_NAME,
  PLATFORM_MARKETING_DESCRIPTION,
} from "@/lib/platform/brand";
import {
  LAUNCH_SPRINT_COPY,
  LAUNCH_SPRINT_DAYS,
  MARKETING_TIERS,
  STARTING_MONTHLY_PRICE,
} from "@/lib/marketing/pricing";

export type JsonLd = Record<string, unknown>;

// Moved to `lib/site-url.ts` so the root layout can build `metadataBase`
// without compiling the pricing tables below. Re-exported for the marketing
// pages that already import them from here.
export { getSiteUrl, absoluteUrl } from "@/lib/site-url";
import { getSiteUrl, absoluteUrl } from "@/lib/site-url";

export type MarketingMetadataInput = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  noIndex?: boolean;
};

export function buildMarketingMetadata({
  title,
  description,
  path,
  keywords,
  noIndex,
}: MarketingMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const pageTitle = title === PLATFORM_BRAND_NAME ? title : `${title} | ${PLATFORM_BRAND_NAME}`;

  return {
    title,
    description,
    keywords,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: pageTitle,
      description,
      url,
      siteName: PLATFORM_BRAND_NAME,
      type: "website",
      locale: "en_ZW",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
    },
  };
}

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: PLATFORM_BRAND_NAME,
    url: getSiteUrl(),
    description: PLATFORM_MARKETING_DESCRIPTION,
    areaServed: [
      { "@type": "Country", name: "Zimbabwe" },
      { "@type": "Place", name: "Africa" },
    ],
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        url: absoluteUrl("/home/book-demo"),
        availableLanguage: ["en"],
      },
    ],
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: PLATFORM_BRAND_NAME,
    url: getSiteUrl(),
    inLanguage: "en-ZW",
    description: PLATFORM_MARKETING_DESCRIPTION,
  };
}

export function softwareApplicationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PLATFORM_BRAND_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android, iOS",
    description:
      "Industry-ready business software for formalising trade businesses, workshops, automotive operations and schools.",
    url: getSiteUrl(),
    offers: offerCatalogJsonLd("/home/pricing"),
  };
}

export function offerCatalogJsonLd(path = "/home/pricing"): JsonLd {
  return {
    "@type": "OfferCatalog",
    name: `${PLATFORM_BRAND_NAME} pricing`,
    url: absoluteUrl(path),
    itemListElement: MARKETING_TIERS.map((tier) => ({
      "@type": "Offer",
      name: tier.name,
      description: tier.description,
      price: tier.monthlyPrice,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteUrl(tier.ctaHref),
    })),
    lowPrice: STARTING_MONTHLY_PRICE,
    priceCurrency: "USD",
  };
}

export function serviceJsonLd(input: {
  name: string;
  description: string;
  path: string;
  serviceType: string;
  keywords?: string[];
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: input.name,
    description: input.description,
    serviceType: input.serviceType,
    provider: {
      "@type": "Organization",
      name: PLATFORM_BRAND_NAME,
      url: getSiteUrl(),
    },
    areaServed: { "@type": "Country", name: "Zimbabwe" },
    url: absoluteUrl(input.path),
    keywords: input.keywords?.join(", "),
    offers: offerCatalogJsonLd("/home/pricing"),
  };
}

export function productJsonLd(input: {
  name: string;
  description: string;
  path: string;
  price: number | null;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${input.name} - ${PLATFORM_BRAND_NAME}`,
    description: input.description,
    brand: { "@type": "Brand", name: PLATFORM_BRAND_NAME },
    url: absoluteUrl(input.path),
    offers:
      input.price === null
        ? {
            "@type": "Offer",
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: absoluteUrl(input.path),
          }
        : {
            "@type": "Offer",
            price: input.price,
            priceCurrency: "USD",
            availability: "https://schema.org/InStock",
            url: absoluteUrl(input.path),
          },
  };
}

export function launchSprintJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${PLATFORM_BRAND_NAME} Launch Sprint`,
    description: LAUNCH_SPRINT_COPY,
    serviceType: "Software implementation",
    provider: {
      "@type": "Organization",
      name: PLATFORM_BRAND_NAME,
      url: getSiteUrl(),
    },
    areaServed: { "@type": "Country", name: "Zimbabwe" },
    url: absoluteUrl("/home/implementation-support"),
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Duration",
        value: `${LAUNCH_SPRINT_DAYS} days`,
      },
    ],
  };
}

export function faqJsonLd(faqs: Array<{ q: string; a: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export const LAUNCH_SPRINT_SEO_COPY = `${LAUNCH_SPRINT_DAYS}-day Launch Sprint with workflow mapping, migration, configuration, training and go-live support`;
