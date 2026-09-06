import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd, SegmentDetail } from "@/app/home/site-components";
import {
  getCanonicalSegmentSlug,
  getSegmentByAnySlug,
  segments,
} from "@/app/home/site-data";
import {
  breadcrumbJsonLd,
  buildMarketingMetadata,
  serviceJsonLd,
} from "@/lib/marketing/seo";

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * Only canonical slugs are pre-rendered. Every retired slug — the old vertical
 * names, and schools, which moved to its own page — is 308'd at the routing
 * layer in `next.config.ts`, so nothing reaches this route needing a rewrite.
 * The `getSegmentByAnySlug` lookup below stays as a safety net for any legacy
 * slug added to the data without a matching config rule.
 */
export function generateStaticParams() {
  return segments.map((segment) => ({ slug: segment.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const segment = getSegmentByAnySlug(slug);

  if (!segment) return { title: "Solutions" };

  return buildMarketingMetadata(segment.seo);
}

export default async function SegmentPage({ params }: Props) {
  const { slug } = await params;
  const canonicalSlug = getCanonicalSegmentSlug(slug);

  if (!canonicalSlug) notFound();
  if (canonicalSlug !== slug) permanentRedirect(`/home/solutions/${canonicalSlug}`);

  const segment = getSegmentByAnySlug(slug);
  if (!segment) notFound();

  return (
    <>
      <JsonLd
        data={[
          serviceJsonLd({
            name: `${segment.title} — business software`,
            description: segment.seo.description,
            path: segment.seo.path,
            serviceType: segment.title,
            keywords: segment.seo.keywords,
          }),
          breadcrumbJsonLd([
            { name: "Home", path: "/home" },
            { name: "Solutions", path: "/home/solutions" },
            { name: segment.title, path: segment.seo.path },
          ]),
        ]}
      />
      <SegmentDetail segment={segment} />
    </>
  );
}
