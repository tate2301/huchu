import type {
  OperationManifest,
  CompanyWorkspace,
  AdminMetricCard,
  AdminSearchResult,
  CommercialCenterData,
  IdentityHubData,
  ReliabilityClusterData,
  SupportAccessHubData,
  AdminSupportState,
  WorkspaceOverview,
} from "./types";

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
  const result = data?.result;
  if (result && typeof result === "object" && "ok" in result) {
    if (!result.ok) {
      throw new Error(result.message ?? "Operation failed");
    }
    return result.resource ?? result;
  }
  return result ?? data;
}

export async function searchAdminPortal(query: string): Promise<AdminSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const response = await fetch(`/api/platform-admin/search?q=${encodeURIComponent(trimmed)}`, {
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to search control plane");
  return data.results;
}

export async function fetchIdentityHub(companyId?: string, search?: string): Promise<IdentityHubData> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (search?.trim()) params.set("search", search.trim());

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/platform-admin/identity${suffix}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load identity hub");
  return data;
}

export async function fetchWorkspaceOverview(companyId: string): Promise<WorkspaceOverview> {
  const response = await fetch(`/api/platform-admin/workspaces/${companyId}/overview`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load workspace overview");
  return data;
}

export async function fetchCommercialCenter(): Promise<CommercialCenterData> {
  const response = await fetch("/api/platform-admin/commercial", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load commercial center");
  return data;
}

export async function fetchReliabilityCluster(companyId?: string): Promise<ReliabilityClusterData> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const response = await fetch(`/api/platform-admin/reliability${query}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load reliability cluster");
  return data;
}

export async function fetchSupportAccessHub(companyId?: string, search?: string): Promise<SupportAccessHubData> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (search?.trim()) params.set("search", search.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/platform-admin/support-access${suffix}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load support access");
  return data;
}

export async function fetchSupportState(companyId?: string, actor?: string): Promise<AdminSupportState> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (actor?.trim()) params.set("actor", actor.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/platform-admin/support-state${suffix}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error ?? "Failed to load support state");
  return data;
}
