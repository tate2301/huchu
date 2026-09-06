"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@corelithzw/ui/components/card";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { CLIENT_BUNDLE_TEMPLATES, getClientTemplateBundleCodes } from "@corelithzw/platform/client-templates";
import { getBundleDefinition, getTierDefinition } from "@corelithzw/platform/feature-catalog";

// Derived from the canonical template catalog so admin copy can never drift
// from what a template actually provisions.
const templates = CLIENT_BUNDLE_TEMPLATES.map((template) => ({
  code: template.code,
  name: template.label,
  description: template.description,
  tier: getTierDefinition(template.recommendedTierCode)?.name ?? template.recommendedTierCode,
  bundles: template.includeAllFeatures
    ? ["All bundles"]
    : getClientTemplateBundleCodes(template.code).map(
        (bundleCode) => getBundleDefinition(bundleCode)?.name ?? bundleCode,
      ),
  highlights: template.targetClients,
}));

export function TemplatesPage() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-[var(--text-muted)]">Shortcut to assign tier, enable bundles, and toggle features safely.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.code} className="border-[var(--border)]">
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
              <p className="text-sm text-[var(--text-muted)]">{template.description}</p>
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
