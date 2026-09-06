/**
 * The browser's client for the tenant's user management: creating a member,
 * suspending one, resetting a password, changing a role. Reads `/api/users/*`.
 */
import { fetchJson } from "../api-client";
import type { UserRole } from "../roles";
import type { UserSummary } from "./users";

export type ManagedUserRole = UserRole;

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

export async function createManagedUser(input: CreateManagedUserInput) {
  return fetchJson<UserSummary>("/api/users/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setManagedUserStatus(input: SetManagedUserStatusInput) {
  return fetchJson<UserSummary>("/api/users/status", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function resetManagedUserPassword(input: ResetManagedUserPasswordInput) {
  return fetchJson<UserSummary>("/api/users/password-reset", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function changeManagedUserRole(input: ChangeManagedUserRoleInput) {
  return fetchJson<UserSummary>("/api/users/role-change", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
