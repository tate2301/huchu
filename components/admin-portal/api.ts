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
import { buildCallbackLoginPath } from "@/lib/auth-core/redirects";

type AdminApiErrorPayload = {
  error?: string;
  code?: string;
};

const AUTH_FAILURE_CODES = new Set(["UNAUTHORIZED", "AUTH_EXPIRED"]);

type OperationEnvelope = {
  result?: unknown;
};

type OperationResult = {
  ok?: boolean;
  message?: string;
  resource?: unknown;
};

function redirectAdminToLogin() {
  if (typeof window === "undefined") {
    return;
  }

  const callbackUrl = `${window.location.pathname}${window.location.search}`;
  window.location.assign(buildCallbackLoginPath("/admin/login", callbackUrl));
}

function isOperationResult(value: unknown): value is OperationResult {
  return typeof value === "object" && value !== null && "ok" in value;
}

async function parseAdminResponse<T, TResult>(
  response: Response,
  fallbackMessage: string,
  select: (data: T) => TResult,
): Promise<TResult> {
  const data = (await response.json()) as T & AdminApiErrorPayload;
  if (!response.ok) {
    if (response.status === 401 && AUTH_FAILURE_CODES.has(data?.code ?? "")) {
      redirectAdminToLogin();
    }
    throw new Error(data?.error ?? fallbackMessage);
  }
  return select(data);
}

export async function fetchManifest(): Promise<OperationManifest> {
  const response = await fetch("/api/platform-admin/manifest", { cache: "no-store" });
  return parseAdminResponse<{ manifest: OperationManifest }, OperationManifest>(
    response,
    "Failed to load manifest",
    (data) => data.manifest,
  );
}

export async function fetchCompanies(): Promise<CompanyWorkspace[]> {
  const response = await fetch("/api/platform-admin/companies", { cache: "no-store" });
  return parseAdminResponse<{ companies: CompanyWorkspace[] }, CompanyWorkspace[]>(
    response,
    "Failed to load companies",
    (data) => data.companies,
  );
}

export async function fetchMetrics(companyId?: string): Promise<AdminMetricCard[]> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const response = await fetch(`/api/platform-admin/metrics${query}`, { cache: "no-store" });
  return parseAdminResponse<{ metrics: AdminMetricCard[] }, AdminMetricCard[]>(
    response,
    "Failed to load metrics",
    (data) => data.metrics,
  );
}

export async function executeOperation(input: {
  module: string;
  action: string;
  payload?: unknown;
  args?: unknown[];
}): Promise<unknown>;
export async function executeOperation<T>(input: {
  module: string;
  action: string;
  payload?: unknown;
  args?: unknown[];
}): Promise<T>;
export async function executeOperation<T = unknown>(input: {
  module: string;
  action: string;
  payload?: unknown;
  args?: unknown[];
}): Promise<T> {
  const response = await fetch("/api/platform-admin/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseAdminResponse<OperationEnvelope, OperationEnvelope>(
    response,
    "Operation failed",
    (payload) => payload,
  );
  const result = data?.result;
  if (isOperationResult(result)) {
    if (!result.ok) {
      throw new Error(result.message ?? "Operation failed");
    }
    return (result.resource ?? result) as T;
  }
  return (result ?? data) as T;
}

export async function searchAdminPortal(query: string): Promise<AdminSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const response = await fetch(`/api/platform-admin/search?q=${encodeURIComponent(trimmed)}`, {
    cache: "no-store",
  });
  return parseAdminResponse<{ results: AdminSearchResult[] }, AdminSearchResult[]>(
    response,
    "Failed to search control plane",
    (data) => data.results,
  );
}

export async function fetchIdentityHub(companyId?: string, search?: string): Promise<IdentityHubData> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (search?.trim()) params.set("search", search.trim());

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/platform-admin/identity${suffix}`, { cache: "no-store" });
  return parseAdminResponse<IdentityHubData, IdentityHubData>(
    response,
    "Failed to load identity hub",
    (data) => data,
  );
}

export async function fetchWorkspaceOverview(companyId: string): Promise<WorkspaceOverview> {
  const response = await fetch(`/api/platform-admin/workspaces/${companyId}/overview`, { cache: "no-store" });
  return parseAdminResponse<WorkspaceOverview, WorkspaceOverview>(
    response,
    "Failed to load workspace overview",
    (data) => data,
  );
}

export async function fetchCommercialCenter(): Promise<CommercialCenterData> {
  const response = await fetch("/api/platform-admin/commercial", { cache: "no-store" });
  return parseAdminResponse<CommercialCenterData, CommercialCenterData>(
    response,
    "Failed to load commercial center",
    (data) => data,
  );
}

export async function fetchReliabilityCluster(companyId?: string): Promise<ReliabilityClusterData> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const response = await fetch(`/api/platform-admin/reliability${query}`, { cache: "no-store" });
  return parseAdminResponse<ReliabilityClusterData, ReliabilityClusterData>(
    response,
    "Failed to load reliability cluster",
    (data) => data,
  );
}

export async function fetchSupportAccessHub(companyId?: string, search?: string): Promise<SupportAccessHubData> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (search?.trim()) params.set("search", search.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/platform-admin/support-access${suffix}`, { cache: "no-store" });
  return parseAdminResponse<SupportAccessHubData, SupportAccessHubData>(
    response,
    "Failed to load support access",
    (data) => data,
  );
}

export async function fetchSupportState(companyId?: string, actor?: string): Promise<AdminSupportState> {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (actor?.trim()) params.set("actor", actor.trim());
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/platform-admin/support-state${suffix}`, { cache: "no-store" });
  return parseAdminResponse<AdminSupportState, AdminSupportState>(
    response,
    "Failed to load support state",
    (data) => data,
  );
}
