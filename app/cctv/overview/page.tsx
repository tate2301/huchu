"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchNVRs, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { StatusState } from "@/components/shared/status-state";
import { OverviewFeedView } from "@/app/cctv/views/overview";

export default function CCTVOverviewPage() {
  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: nvrsData,
    isLoading: nvrsLoading,
    error: nvrsError,
  } = useQuery({
    queryKey: ["nvrs", "overview"],
    queryFn: () =>
      fetchNVRs({
        limit: 200,
      }),
  });

  const isLoading = sitesLoading || nvrsLoading;
  const pageError = sitesError || nvrsError;

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading CCTV overview"
        description="Preparing the combined feed."
      />
    );
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load CCTV overview"
        description={getApiErrorMessage(pageError)}
      />
    );
  }

  return <OverviewFeedView sites={sites || []} nvrs={nvrsData?.data || []} />;
}
