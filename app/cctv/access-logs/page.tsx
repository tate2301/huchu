"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCameras, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { StatusState } from "@/components/shared/status-state";
import { AccessLogsView } from "@/app/cctv/views/access-logs";

export default function CCTVAccessLogsPage() {
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
    queryKey: ["cameras", "access-logs"],
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
        title="Loading access logs"
        description="Preparing camera and site filters."
      />
    );
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load access logs"
        description={getApiErrorMessage(pageError)}
      />
    );
  }

  return <AccessLogsView sites={sites || []} cameras={camerasData?.data || []} />;
}
