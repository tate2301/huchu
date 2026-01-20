import { PageHeading } from "@/components/layout/page-heading"
import { SystemStatus } from "@/components/status/system-status"

export default function StatusPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeading title="Implementation Status" description="System development progress" />
      <SystemStatus />
    </div>
  )
}
