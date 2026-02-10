"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchCameras, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { StatusState } from "@/components/shared/status-state";
import { PlaybackView } from "@/app/cctv/views/playback";

export default function CCTVPlaybackPage() {
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
    queryKey: ["cameras", "playback"],
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
        title="Loading playback search"
        description="Preparing camera and site filters."
      />
    );
  }

  if (pageError) {
    return (
      <StatusState
        variant="error"
        title="Unable to load playback search"
        description={getApiErrorMessage(pageError)}
      />
    );
  }

  return <PlaybackView sites={sites || []} cameras={camerasData?.data || []} />;
}
