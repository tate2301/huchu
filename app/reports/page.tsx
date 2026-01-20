import { PageHeading } from "@/components/layout/page-heading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ReportsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeading title="Reports" description="Export PDFs, CSV, audit packs" />

      <Card>
        <CardHeader>
          <CardTitle>Export & Reports</CardTitle>
          <CardDescription>Generate reports for any date range</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Features: Daily/weekly/monthly reports, PDF exports, CSV downloads, WhatsApp-friendly summaries, audit pack
            generation.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
