"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { StatusState } from "@/components/shared/status-state"
import { NVRsView } from "../views/nvrs"

export default function NVRsPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  // Fetch sites for filtering
  const { data: sites, isLoading, error } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading NVR module"
        description="Getting site filters and recorder status."
      />
    )
  }

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load NVR module"
        description={getApiErrorMessage(error)}
      />
    )
  }

  return (
    <NVRsView 
      sites={sites || []}
      selectedSiteId={selectedSiteId}
      onSiteChange={setSelectedSiteId}
    />
  )
}
