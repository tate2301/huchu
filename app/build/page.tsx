"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BuildFrame, BuildError, BuildLoading } from "@/components/build/build-frame";
import { BuildHomeView } from "@/components/build/build-home-view";
import { BUILD_HOME_KEY, fetchBuildHome } from "@/components/build/build-data";
import { NewDrawer } from "@/components/build/new-drawer";
import { ButtonLink } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { readBuildQuery, type BuildQuery } from "@/lib/build/items";

/** Build (PageBuildHome): everything you can build. `?kind=forms|documents|emails|reports` and `?used=` are its views. */
function BuildHome() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = readBuildQuery(params);
  const [adding, setAdding] = React.useState(false);

  const home = useQuery({ queryKey: BUILD_HOME_KEY, queryFn: fetchBuildHome });

  const onQuery = React.useCallback(
    (next: Partial<BuildQuery>) => {
      const merged = new URLSearchParams(params.toString());
      const names: Record<keyof BuildQuery, string> = { kind: "kind", used: "used", status: "status", q: "q", page: "page" };
      for (const [key, value] of Object.entries(next) as Array<[keyof BuildQuery, unknown]>) {
        const name = names[key];
        if (value === null || value === "" || (key === "page" && value === 1)) merged.delete(name);
        else if (key === "kind") merged.set(name, `${value as string}s`);
        else merged.set(name, String(value));
      }
      const search = merged.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const canStart = home.data?.canStart ?? false;
  return (
    <>
      <PageChrome
        title="Build"
        primary={canStart ? { label: "New", icon: "plus", shortcut: "N", onClick: () => setAdding(true) } : null}
      >
        <ButtonLink icon="file" href="/build/templates">
          From a template
        </ButtonLink>
      </PageChrome>
      <BuildFrame>
        {home.data ? (
          <BuildHomeView
            items={home.data.items}
            counts={home.data.counts}
            finding={home.data.finding}
            provisions={home.data.provisions}
            query={query}
            onQuery={onQuery}
          />
        ) : home.isError ? (
          <BuildError what="Build" onRetry={() => void home.refetch()} />
        ) : (
          <BuildLoading />
        )}
      </BuildFrame>
      {home.data ? <NewDrawer open={adding} onOpenChange={setAdding} data={home.data} /> : null}
    </>
  );
}

export default function BuildPage() {
  // The views are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<BuildFrame><BuildLoading /></BuildFrame>}>
      <BuildHome />
    </React.Suspense>
  );
}
