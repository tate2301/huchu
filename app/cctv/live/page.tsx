"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCameras, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { StatusState } from "@/components/shared/status-state";
import { LiveMonitorView } from "@/app/cctv/views/live";

export default function CCTVLivePage() {
  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });

  const {
    data: camerasData,
    isLoading: camerasLoading,
    error: camerasError,
  } = useQuery({
    queryKey: ["cameras", "live-monitor"],
    queryFn: () =>
      fetchCameras({
        limit: 500,
      }),
  });

  const isLoading = sitesLoading || camerasLoading;
  const pageError = sitesError || camerasError;

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading live monitor"
        description="Preparing site filters and camera streams."
      />
    );
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load live monitor"
        description={getApiErrorMessage(pageError)}
      />
    );
  }

  return <LiveMonitorView sites={sites || []} cameras={camerasData?.data || []} />;
}
