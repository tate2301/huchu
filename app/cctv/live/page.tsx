"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCameras, fetchNVRs, fetchSites } from "@/lib/api";
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

  const {
    data: nvrsData,
    isLoading: nvrsLoading,
    error: nvrsError,
  } = useQuery({
    queryKey: ["nvrs", "live-monitor"],
    queryFn: () =>
      fetchNVRs({
        limit: 500,
      }),
  });

  const isLoading = sitesLoading || camerasLoading || nvrsLoading;
  const pageError = sitesError || camerasError || nvrsError;

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

  return (
    <LiveMonitorView
      sites={sites || []}
      cameras={camerasData?.data || []}
      nvrs={nvrsData?.data || []}
    />
  );
}
