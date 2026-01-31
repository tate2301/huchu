"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSites } from "@/lib/api"
import { EventsView } from "../views/events"

export default function EventsPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")

  // Fetch sites for filtering
  const { data: sites } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  return (
    <EventsView 
      sites={sites || []}
      selectedSiteId={selectedSiteId}
      onSiteChange={setSelectedSiteId}
    />
  )
}
