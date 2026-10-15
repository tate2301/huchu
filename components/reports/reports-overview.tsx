"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { Button, ButtonLink, Empty, Kit, KitScreen } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { REPORTS_HOME_KEY } from "@/components/layout/workspace-rail/reports-groups";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CustomReport } from "@/lib/reports/custom/document";
import type { ReportsOverview } from "@/lib/reports/overview";

import { ReportsOverviewLoading, ReportsOverviewView } from "./reports-overview-view";

const noop = () => () => {};

/**
 * Reports → Overview in a vertical's workspace (PageSchoolReports,
 * PageMineReports, PagePayReports, PageShopReports, PageRetailReports):
 * New template opens the reports a template starts from; Build a report
 * opens the builder on a new report.
 */
export function ReportsOverviewScreen({ templatesHref }: { templatesHref: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const overview = useQuery({
    queryKey: ["reports", "overview"],
    queryFn: () => fetchJson<ReportsOverview>("/api/v2/reports/overview"),
  });

  // The query cache is persisted for offline use: nothing from it until mounted, so the first render matches the server's.
  const mounted = React.useSyncExternalStore(noop, () => true, () => false);
  const data = mounted ? overview.data : undefined;
  const [building, setBuilding] = React.useState(false);
  const build = React.useCallback(async () => {
    setBuilding(true);
    try {
      const made = await fetchJson<{ report: CustomReport }>("/api/v2/reports/custom", { method: "POST", body: JSON.stringify({}) });
      await queryClient.invalidateQueries({ queryKey: REPORTS_HOME_KEY });
      router.push(`/reports/c/${made.report.id}/edit`);
    } catch (error) {
      toast({ title: "Report not created", description: getApiErrorMessage(error), variant: "destructive" });
      setBuilding(false);
    }
  }, [queryClient, router, toast]);

  const primary = React.useMemo(
    () => ({ label: "Build a report", icon: "plus" as const, shortcut: "N", onClick: () => void build(), disabled: building ? "Making the report" : undefined }),
    [build, building],
  );

  return (
    <>
      <PageChrome title="Reports" primary={primary}>
        <Kit contents>
          <ButtonLink href={templatesHref} icon="new">
            New template
          </ButtonLink>
        </Kit>
      </PageChrome>
      <Kit className="kit-main">
        <KitScreen slug="reports">
          <div className="mn">
            {data ? (
              <ReportsOverviewView overview={data} />
            ) : mounted && overview.isError ? (
              <Empty
                icon="warn"
                title={typeof navigator !== "undefined" && !navigator.onLine ? "You are offline" : "The overview did not load"}
                action={
                  <Button icon="history" onClick={() => void overview.refetch()}>
                    Try again
                  </Button>
                }
              >
                {getApiErrorMessage(overview.error, "Check the connection and try again.")}
              </Empty>
            ) : (
              <ReportsOverviewLoading />
            )}
          </div>
        </KitScreen>
      </Kit>
    </>
  );
}
