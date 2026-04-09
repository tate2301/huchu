"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { fetchSites } from "@/lib/api"
import { getApiErrorMessage } from "@/lib/api-client"
import { PageActions } from "@/components/layout/page-actions"
import { RecordSavedBanner } from "@/components/shared/record-saved-banner"
import { StatusState } from "@/components/shared/status-state"
import { Button } from "@/components/ui/button"
import { CamerasView } from "../views/cameras"

export default function CamerasPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string>("")
  const searchParams = useSearchParams()
  const createdId = searchParams.get("createdId")

  // Fetch sites for filtering
  const { data: sites, isLoading, error } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  })

  if (isLoading) {
    return (
      <StatusState
        variant="loading"
        title="Loading camera module"
      />
    )
  }

  if (error) {
    return (
      <StatusState
        variant="error"
        title="Unable to load camera module"
      />
    )
  }

  return (
    <>
      <PageActions>
        <Button asChild>
          <Link href="/cctv/cameras/new">Register Camera</Link>
        </Button>
      </PageActions>

      <RecordSavedBanner entityLabel="camera" />

      <CamerasView
        sites={sites || []}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
        createdId={createdId}
      />
    </>
  )
}
