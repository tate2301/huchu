import type { OperationManifest, CompanyWorkspace, AdminMetricCard } from "./types";

export async function fetchManifest(): Promise<OperationManifest> {
  const response = await fetch("/api/platform-admin/manifest", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error ?? "Failed to load manifest");
  }
  return data.manifest;
}

export async function fetchCompanies(): Promise<CompanyWorkspace[]> {
  const response = await fetch("/api/platform-admin/companies", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load companies");
  return data.companies;
}

export async function fetchMetrics(companyId?: string): Promise<AdminMetricCard[]> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const response = await fetch(`/api/platform-admin/metrics${query}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load metrics");
  return data.metrics;
}

export async function executeOperation(input: {
  module: string;
  action: string;
  payload?: unknown;
  args?: unknown[];
}) {
  const response = await fetch("/api/platform-admin/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Operation failed");
  return data;
}
