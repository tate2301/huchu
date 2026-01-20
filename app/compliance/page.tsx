import { PageHeading } from "@/components/layout/page-heading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function CompliancePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeading title="Compliance" description="Permits, inspections, incidents - Phase 5" />

      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 5</CardTitle>
          <CardDescription>Safety, environmental, and regulatory compliance</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Features: Permit calendar with expiry alerts, incident reporting with photos, training matrix,
            inspection logs, audit pack exports.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
