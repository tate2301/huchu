"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Card, Skeleton } from "@corelithzw/react";

import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchPreferencesProfile } from "@corelithzw/platform/preferences/api";

export function OrganizationOverviewPreferences() {
  const profileQuery = useQuery({
    queryKey: ["preferences", "profile"],
    queryFn: fetchPreferencesProfile,
  });

  if (profileQuery.isLoading) {
    return (
      <Card>
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} variant="text" />
          ))}
        </div>
      </Card>
    );
  }

  if (profileQuery.error || !profileQuery.data) {
    return (
      <Alert tone="danger" title="Unable to load organization">
        {getApiErrorMessage(profileQuery.error)}
      </Alert>
    );
  }

  const { company } = profileQuery.data;

  return (
    <Card title="Workspace context">
      <div className="settings-section">
        <div className="settings-row">
          <div>
            <div className="t-label-sm">Organization name</div>
            <p className="t-caption t-muted">The name shown across workspace surfaces.</p>
          </div>
          <span>{company.name}</span>
        </div>
        <div className="settings-row">
          <div>
            <div className="t-label-sm">Workspace slug</div>
            <p className="t-caption t-muted">Used in hosted workspace identity and support context.</p>
          </div>
          <span className="t-mono">{company.slug}</span>
        </div>
        <div className="settings-row">
          <div>
            <div className="t-label-sm">Workspace profile</div>
            <p className="t-caption t-muted">Controls role templates and module defaults.</p>
          </div>
          <Badge tone="outline">{company.workspaceProfile}</Badge>
        </div>
        <div className="settings-row">
          <div>
            <div className="t-label-sm">Tenant status</div>
            <p className="t-caption t-muted">Billing and access enforcement use this state.</p>
          </div>
          <Badge tone={company.tenantStatus === "ACTIVE" ? "success" : "warn"}>
            {company.tenantStatus}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
