"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { StatusState } from "@/components/shared/status-state"
import { EventsView } from "../views/events"

export default function EventsPage() {
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
        title="Loading events module"
        description="Getting site filters and event feeds."
      />
    )
  }

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load events module"
        description={getApiErrorMessage(error)}
      />
    )
  }

  return (
    <EventsView 
      sites={sites || []}
      selectedSiteId={selectedSiteId}
      onSiteChange={setSelectedSiteId}
    />
  )
}
