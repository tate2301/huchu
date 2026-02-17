import { fetchJson } from "@/lib/api-client";

export type ManagedUserRole = "MANAGER" | "CLERK";

export type ManagedUserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ManagedUsersPage = {
  data: ManagedUserSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore?: boolean;
  };
};

export type FetchManagedUsersInput = {
  role?: string;
  active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
};

export type CreateManagedUserInput = {
  name: string;
  email: string;
  password: string;
  role: ManagedUserRole;
};

export type SetManagedUserStatusInput = {
  userId: string;
  isActive: boolean;
};

export type ResetManagedUserPasswordInput = {
  userId: string;
  newPassword: string;
};

export type ChangeManagedUserRoleInput = {
  userId: string;
  role: ManagedUserRole;
};

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function fetchManagedUsers(params: FetchManagedUsersInput) {
  const query = buildQuery({
    role: params.role,
    active: params.active,
    search: params.search,
    page: params.page,
    limit: params.limit,
  });
  return fetchJson<ManagedUsersPage>(`/api/users${query}`);
}

export async function createManagedUser(input: CreateManagedUserInput) {
  return fetchJson<ManagedUserSummary>("/api/users/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setManagedUserStatus(input: SetManagedUserStatusInput) {
  return fetchJson<ManagedUserSummary>("/api/users/status", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resetManagedUserPassword(input: ResetManagedUserPasswordInput) {
  return fetchJson<ManagedUserSummary>("/api/users/password-reset", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function changeManagedUserRole(input: ChangeManagedUserRoleInput) {
  return fetchJson<ManagedUserSummary>("/api/users/role-change", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
