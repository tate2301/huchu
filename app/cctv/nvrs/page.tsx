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
import { NVRsView } from "../views/nvrs"

export default function NVRsPage() {
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
    <>
      <PageActions>
        <Button asChild>
          <Link href="/cctv/nvrs/new">Register NVR</Link>
        </Button>
      </PageActions>

      <RecordSavedBanner entityLabel="NVR" />

      <NVRsView
        sites={sites || []}
        selectedSiteId={selectedSiteId}
        onSiteChange={setSelectedSiteId}
        createdId={createdId}
      />
    </>
  )
}
