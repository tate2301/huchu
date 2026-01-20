import { PageHeading } from "@/components/layout/page-heading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeading
        title="Analytics Dashboard"
        description="Cross-mine insights - Phase 6"
      />

      <Card>
        <CardHeader>
          <CardTitle>Coming in Phase 6</CardTitle>
          <CardDescription>Management dashboards and analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Features: Production trends across 5 sites, downtime analysis, fuel usage tracking, cost per gram
            calculations, safety metrics.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
