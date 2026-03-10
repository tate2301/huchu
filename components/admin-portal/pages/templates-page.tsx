"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const templates = [
  { name: "Core Starter", tier: "Basic", bundles: ["Custom Branding"], highlights: ["Shift reports", "Attendance", "Inventory"] },
  { name: "Gold Mine", tier: "Standard", bundles: ["Gold Advanced", "Analytics Pro"], highlights: ["Gold chain of custody", "Exceptions", "Audit trail"] },
  { name: "Small Business Security", tier: "Standard", bundles: ["CCTV Suite", "User Management Pro"], highlights: ["Live view", "Playback", "User onboarding"] },
  { name: "Tech Workshop", tier: "Standard", bundles: ["Maintenance Pro", "Analytics Pro"], highlights: ["Work orders", "Preventive schedule", "Downtime analytics"] },
  { name: "Schools", tier: "Enterprise", bundles: ["Schools Suite", "Portal Suite"], highlights: ["Admissions", "Results", "Parent/Student portals"] },
  { name: "Car Sales", tier: "Standard", bundles: ["Auto Sales Suite", "Portal Suite"], highlights: ["Inventory", "Leads", "Deals"] },
  { name: "Thrift", tier: "Standard", bundles: ["Smart Shop Suite", "Portal Suite"], highlights: ["Catalog", "Checkout", "Portals"] },
  { name: "All Features", tier: "Enterprise", bundles: ["All bundles"], highlights: ["Everything on"] },
];

export function TemplatesPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-[var(--text-muted)]">Shortcut to assign tier, enable bundles, and toggle features safely.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.name} className="border-[var(--border)]">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">{template.name}</CardTitle>
              <CardDescription>Tier: {template.tier}</CardDescription>
              <div className="flex flex-wrap gap-2">
                {template.bundles.map((bundle) => (
                  <Badge key={bundle} variant="outline">{bundle}</Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                {template.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Button size="sm">Apply Template</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
