"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ExploreError, ExploreLoading, ExploreNotYours, ExplorePage } from "@/components/explore/explore-page";
import { TemplatesView } from "@/components/explore/templates-view";
import { useExploreCatalog } from "@/components/explore/use-explore";
import { PageChrome } from "@/components/layout/page-chrome";
import { PRODUCTS, type ProductKey } from "@/lib/explore/products";

const NEW_QUESTION = { label: "New question", icon: "plus" as const, href: "/explore", shortcut: "N" };

/** Explore → Templates (the ExploreTemplates board). The product chosen lives in the address (`?product=crm`). */
function Templates() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const catalog = useExploreCatalog();
  const asked = params.get("product");
  const product = PRODUCTS.some((info) => info.key === asked) ? (asked as ProductKey) : null;

  return (
    <>
      <PageChrome title="Templates" primary={catalog.data?.canUse ? NEW_QUESTION : null} />
      <ExplorePage>
        {catalog.data?.canUse ? (
          <TemplatesView
            templates={catalog.data.templates}
            product={product}
            workspaceName={catalog.data.workspaceName}
            onProduct={(next) => router.replace(next ? `${pathname}?product=${next}` : pathname, { scroll: false })}
          />
        ) : catalog.data ? (
          <ExploreNotYours who={catalog.data.who} />
        ) : catalog.isError ? (
          <ExploreError what="Templates" onRetry={() => catalog.refetch()} />
        ) : (
          <ExploreLoading />
        )}
      </ExplorePage>
    </>
  );
}

export default function ExploreTemplatesPage() {
  return (
    <React.Suspense fallback={<ExplorePage><ExploreLoading /></ExplorePage>}>
      <Templates />
    </React.Suspense>
  );
}
