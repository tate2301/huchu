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
import { buildCallbackLoginPath } from "@/lib/auth-redirect";

class AdminAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AdminAuthError";
  }
}

type AdminOperationEnvelope = {
  ok?: boolean;
  message?: string;
  resource?: unknown;
};

function redirectToAdminLogin() {
  if (typeof window === "undefined") {
    return;
  }

  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  window.location.assign(buildCallbackLoginPath("/admin/login", callbackUrl));
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchAdminJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
  });
  const data = await readJson(response);

  if (response.status === 401) {
    redirectToAdminLogin();
    throw new AdminAuthError((data as { error?: string } | null)?.error ?? "Unauthorized");
  }

  if (!response.ok) {
    throw new Error((data as { error?: string } | null)?.error ?? "Request failed");
  }

  return data as T;
}

export async function fetchManifest(): Promise<OperationManifest> {
  const data = await fetchAdminJson<{ manifest: OperationManifest }>("/api/platform-admin/manifest");
  return data.manifest;
}

export async function fetchCompanies(): Promise<CompanyWorkspace[]> {
  const data = await fetchAdminJson<{ companies: CompanyWorkspace[] }>("/api/platform-admin/companies");
  return data.companies;
}

export async function fetchMetrics(companyId?: string): Promise<AdminMetricCard[]> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const data = await fetchAdminJson<{ metrics: AdminMetricCard[] }>(`/api/platform-admin/metrics${query}`);
  return data.metrics;
}

export async function executeOperation<T = unknown>(input: {
  module: string;
  action: string;
  payload?: unknown;
  args?: unknown[];
}): Promise<T> {
  const data = await fetchAdminJson<{ result?: unknown } | Record<string, unknown>>("/api/platform-admin/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = "result" in data ? data.result : data;
  if (result && typeof result === "object" && "ok" in result) {
    const envelope = result as AdminOperationEnvelope;
    if (!envelope.ok) {
      throw new Error(envelope.message ?? "Operation failed");
    }
    return (envelope.resource ?? result) as T;
  }
  return (result ?? data) as T;
}

export async function searchAdminPortal(query: string): Promise<AdminSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const data = await fetchAdminJson<{ results: AdminSearchResult[] }>(`/api/platform-admin/search?q=${encodeURIComponent(trimmed)}`);
  return data.results;
}

export async function fetchIdentityHub(companyId?: string, search?: string): Promise<IdentityHubData> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (search?.trim()) params.set("search", search.trim());

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return fetchAdminJson<IdentityHubData>(`/api/platform-admin/identity${suffix}`);
}

export async function fetchWorkspaceOverview(companyId: string): Promise<WorkspaceOverview> {
  const data = await fetchAdminJson<{ overview: WorkspaceOverview } | WorkspaceOverview>(`/api/platform-admin/workspaces/${companyId}/overview`);
  if ("overview" in data) {
    return data.overview;
  }
  return data;
}

export async function fetchCommercialCenter(): Promise<CommercialCenterData> {
  return fetchAdminJson<CommercialCenterData>("/api/platform-admin/commercial");
}

export async function fetchReliabilityCluster(companyId?: string): Promise<ReliabilityClusterData> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return fetchAdminJson<ReliabilityClusterData>(`/api/platform-admin/reliability${query}`);
}

export async function fetchSupportAccessHub(companyId?: string, search?: string): Promise<SupportAccessHubData> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (search?.trim()) params.set("search", search.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return fetchAdminJson<SupportAccessHubData>(`/api/platform-admin/support-access${suffix}`);
}

export async function fetchSupportState(companyId?: string, actor?: string): Promise<AdminSupportState> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (actor?.trim()) params.set("actor", actor.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return fetchAdminJson<AdminSupportState>(`/api/platform-admin/support-state${suffix}`);
}
