"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Alert, Badge, Card, EmptyState, Skeleton, StatCard } from "@corelithzw/react";
import { useQuery } from "@tanstack/react-query";
import { AdminDualBarChart, AdminDonutChart } from "@corelithzw/ui/charts/admin-headless-charts";
import { RetailShell } from "@/components/retail/retail-shell";
import { Button } from "@corelithzw/ui/components/button";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ChevronRight, Palette } from "@corelithzw/ui/lib/icons";
import type { RetailSetupSnapshot } from "@/lib/retail/setup-snapshot";

type SetupOverviewResponse = RetailSetupSnapshot;

const EDIT_LINKS = [
  { label: "Identity and theme", href: "/preferences/organization/branding/identity" },
  { label: "Assets and contact", href: "/preferences/organization/branding/assets" },
  { label: "Finance and defaults", href: "/preferences/organization/branding/finance" },
];

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export default function RetailSetupBrandingPage() {
  const query = useQuery({
    queryKey: ["retail-setup-overview"],
    queryFn: () => fetchJson<SetupOverviewResponse>("/api/v2/retail/setup/overview"),
  });

  const snapshot = query.data;

  const categories = useMemo(() => {
    const branding = snapshot?.branding;
    if (!branding) {
      return [];
    }

    return [
      {
        id: "identity",
        label: "Identity",
        note: "Display name, legal name, trading name",
        value:
          hasValue(branding.displayName) ||
          hasValue(branding.legalName) ||
          hasValue(branding.tradingName)
            ? 1
            : 0,
      },
      {
        id: "assets",
        label: "Assets",
        note: "Logo and visual mark",
        value: hasValue(branding.logoUrl) ? 1 : 0,
      },
      {
        id: "receipt",
        label: "Receipt footer",
        note: "Footer text on documents",
        value: hasValue(branding.defaultFooterText) ? 1 : 0,
      },
      {
        id: "contact",
        label: "Contact line",
        note: "Email, phone, website",
        value:
          hasValue(branding.email) || hasValue(branding.phone) || hasValue(branding.website) ? 1 : 0,
      },
      {
        id: "address",
        label: "Address",
        note: "Physical or postal address",
        value: hasValue(branding.physicalAddress) || hasValue(branding.postalAddress) ? 1 : 0,
      },
      {
        id: "compliance",
        label: "Compliance",
        note: "Registration or tax identifiers",
        value:
          hasValue(branding.registrationNumber) ||
          hasValue(branding.vatNumber) ||
          hasValue(branding.taxNumber)
            ? 1
            : 0,
      },
    ];
  }, [snapshot]);

  const checksComplete = categories.reduce((sum, row) => sum + row.value, 0);
  const totalChecks = categories.length;
  const overviewRows = categories.map((row) => ({
    id: row.id,
    label: row.label,
    primary: row.value,
    secondary: Math.max(1 - row.value, 0),
  }));
  const readinessDonut = [
    { id: "ready", label: "Ready", value: checksComplete, tone: "success" as const },
    {
      id: "missing",
      label: "Missing",
      value: Math.max(totalChecks - checksComplete, 0),
      tone: "warning" as const,
    },
  ];

  /*
   * One primary, and the three deep links live once — in the "Where to edit"
   * list below. They used to sit in the header as well, which is the duplicated
   * action `04-composition.md` step 5 rules out.
   */
  const actions = (
    <Button asChild size="sm">
      <Link href="/preferences/organization/branding/identity">
        <Palette className="h-4 w-4" />
        Edit branding
      </Link>
    </Button>
  );

  const description =
    "Review the customer-facing identity that prints on receipts, invoices, and POS screens.";

  if (query.isPending) {
    return (
      <RetailShell title="Receipt & branding" description={description} actions={actions}>
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Reading the receipt identity…</span>
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton height={104} />
            <Skeleton height={104} />
            <Skeleton height={104} />
          </div>
          <Skeleton height={340} />
          <Skeleton height={240} />
        </div>
      </RetailShell>
    );
  }

  if (query.isError) {
    return (
      <RetailShell title="Receipt & branding" description={description} actions={actions}>
        <Alert tone="danger" title="The branding checks would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      </RetailShell>
    );
  }

  const branding = query.data.branding;
  const effective = query.data.effectiveBranding;

  if (!branding) {
    return (
      <RetailShell title="Receipt & branding" description={description} actions={actions}>
        <EmptyState
          title="No branding has been set"
          body="Receipts will print with the workspace defaults until a name, logo and footer are saved."
          action={
            <Button asChild size="sm">
              <Link href="/preferences/organization/branding/identity">Set the identity</Link>
            </Button>
          }
        />
      </RetailShell>
    );
  }

  const completion = Math.round((checksComplete / Math.max(totalChecks, 1)) * 100);

  return (
    <RetailShell title="Receipt & branding" description={description} actions={actions}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Completion"
          value={`${completion}%`}
          tone={completion === 100 ? "success" : "warn"}
          footer={`${checksComplete} of ${totalChecks} checks`}
        />
        <StatCard
          label="Receipt footer"
          value={hasValue(branding.defaultFooterText) ? "Set" : "Missing"}
          tone={hasValue(branding.defaultFooterText) ? "success" : "warn"}
          footer="Prints under every slip"
        />
        <StatCard
          label="Tax identifiers"
          value={hasValue(branding.vatNumber) || hasValue(branding.taxNumber) ? "Set" : "Missing"}
          tone={hasValue(branding.vatNumber) || hasValue(branding.taxNumber) ? "success" : "warn"}
          footer="VAT and tax numbers"
        />
      </div>

      <Card
        title="What customers will actually see"
        subtitle="Clear identity, a readable footer, and enough contact and compliance detail to avoid questions at the counter."
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.65fr)]">
          <AdminDualBarChart
            rows={overviewRows}
            primaryLabel="Configured"
            secondaryLabel="Missing"
            height={300}
            valueFormatter={(value) => value.toString()}
            emptyLabel="No branding fields to check."
          />
          <AdminDonutChart
            rows={readinessDonut}
            valueLabel="Branding checks"
            valueFormatter={(value) => value.toString()}
            height={300}
            emptyLabel="No branding checks to show."
          />
        </div>
      </Card>

      <Card title="Receipt preview" subtitle="A minimal customer-facing view">
        <div className="mx-auto max-w-md rounded-[var(--card-radius)] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface)] p-5">
          <p className="t-eyebrow t-muted">Brand header</p>
          <h3 className="t-page-title mt-1 text-[color:var(--text-strong)]">
            {branding.displayName || effective?.displayName || "Retail brand"}
          </h3>
          <p className="t-body-sm t-muted mt-1">
            {branding.legalName ||
              branding.tradingName ||
              "Set a legal or trading name for receipts"}
          </p>
          <div className="mt-5 space-y-2 border-t border-[color:var(--border-subtle)] pt-4">
            <p className="t-body-sm t-muted">
              {branding.defaultFooterText ||
                "Add a footer line for support, returns, and tax details."}
            </p>
            <p className="t-body-sm t-muted">
              {branding.email ||
                branding.phone ||
                branding.website ||
                "Add a contact line to reduce customer friction."}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="What to fix next" flush>
          <ul className="list-plain">
            {categories.map((row) => (
              <li key={row.id} className="list-item">
                <span className="lead" aria-hidden="true" />
                <div>
                  <div className="title bold">{row.label}</div>
                  <div className="sub">{row.note}</div>
                </div>
                <div className="meta">
                  <Badge tone={row.value === 1 ? "success" : "warn"}>
                    {row.value === 1 ? "Set" : "Missing"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Where to edit" flush>
          <ul className="list-plain">
            {EDIT_LINKS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="list-item">
                  <span className="lead" aria-hidden="true" />
                  <div className="title bold">{item.label}</div>
                  <div className="meta">
                    <ChevronRight className="chev h-4 w-4" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </RetailShell>
  );
}
