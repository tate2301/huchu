"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BuildError, BuildFrame, BuildLoading } from "@/components/build/build-frame";
import { useMounted } from "@/hooks/use-mounted";
import { BUILD_HOME_KEY, fetchBuildHome } from "@/components/build/build-data";
import { BuildTemplatesView, type TemplatesQuery } from "@/components/build/build-templates-view";
import { NewDrawer } from "@/components/build/new-drawer";
import { useStartBuild } from "@/components/build/use-start";
import { PageChrome } from "@/components/layout/page-chrome";
import { readTemplateView, type TemplateGroup } from "@/lib/build/templates";

const asGroup = (value: string | null): TemplateGroup | null => (value === "forms" || value === "documents" || value === "emails" ? value : null);

/** Build → Templates (PageBuildTemplates). `?view=made|retired` are its views; From Corelith is the page itself. */
function BuildTemplates() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query: TemplatesQuery = { view: readTemplateView(params.get("view")), group: asGroup(params.get("kind")), q: params.get("q") ?? "" };
  const [adding, setAdding] = React.useState(false);
  const [starting, setStarting] = React.useState<string | null>(null);

  const home = useQuery({ queryKey: BUILD_HOME_KEY, queryFn: fetchBuildHome });
  // The query cache is kept for offline use: read it after hydration, so the first paint is the server's.
  const mounted = useMounted();
  const data = mounted ? home.data : undefined;
  const taken = React.useMemo(() => data?.items.map((item) => item.name) ?? [], [data]);
  const start = useStartBuild(taken);

  const onQuery = React.useCallback(
    (next: Partial<TemplatesQuery>) => {
      const merged = new URLSearchParams(params.toString());
      if ("view" in next) {
        if (next.view === "corelith") merged.delete("view");
        else merged.set("view", next.view!);
      }
      if ("group" in next) {
        if (next.group) merged.set("kind", next.group);
        else merged.delete("kind");
      }
      if ("q" in next) {
        if (next.q) merged.set("q", next.q);
        else merged.delete("q");
      }
      const search = merged.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const canStart = data?.canStart ?? false;
  return (
    <>
      <PageChrome title="Templates" primary={canStart ? { label: "New", icon: "plus", shortcut: "N", onClick: () => setAdding(true) } : null} />
      <BuildFrame>
        {data ? (
          <BuildTemplatesView
            templates={data.templates}
            query={query}
            onQuery={onQuery}
            canStart={canStart}
            starting={start.isPending ? starting : null}
            onUse={(template) => {
              if (!template.start) return;
              setStarting(template.key);
              start.mutate(template.start);
            }}
          />
        ) : home.isError ? (
          <BuildError what="Templates" onRetry={() => void home.refetch()} />
        ) : (
          <BuildLoading />
        )}
      </BuildFrame>
      {data ? <NewDrawer open={adding} onOpenChange={setAdding} data={data} /> : null}
    </>
  );
}

export default function BuildTemplatesPage() {
  return (
    <React.Suspense fallback={<BuildFrame><BuildLoading /></BuildFrame>}>
      <BuildTemplates />
    </React.Suspense>
  );
}
