import bcrypt from "bcryptjs";
import type { Prisma } from "@corelithzw/db";

import { prisma } from "../prisma";
import {
  USER_ACCOUNT_STATUSES,
  USER_MANAGEMENT_ROLES,
  type ChangeUserRoleInput,
  type CreateUserInput,
  type ListUsersInput,
  type ResetUserPasswordInput,
  type SetUserStatusInput,
  type UserCreateResult,
  type UserManagementRole,
  type UserResetPasswordResult,
  type UserRole,
  type UserRoleChangeResult,
  type UserStatusResult,
  type UserSummary,
} from "../types";
import { appendAuditEvent } from "./audit-ledger";
import { formatDate, normalizeEmail, normalizeEnum, normalizePasswordInput } from "./helpers";
import { getAllowedUserRolesForWorkspace } from "../../../lib/platform/vertical-roles";

function normalizeAssignableRole(role: string): UserManagementRole {
  return normalizeEnum(role, "role", USER_MANAGEMENT_ROLES);
}

function isUserManagementRole(role: UserRole): role is UserManagementRole {
  return (USER_MANAGEMENT_ROLES as readonly string[]).includes(role);
}

async function getCompanyRoleContext(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      workspaceProfile: true,
      featureFlags: {
        where: {
          isEnabled: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: {
          feature: { select: { key: true } },
        },
      },
    },
  });

  if (!company) return null;

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    workspaceProfile: company.workspaceProfile,
    enabledFeatures: company.featureFlags.map((flag) => flag.feature.key),
  };
}

function getAllowedAssignableRoles(context: {
  workspaceProfile: string | null;
  enabledFeatures: string[];
}): UserManagementRole[] {
  return getAllowedUserRolesForWorkspace({
    workspaceProfile: context.workspaceProfile,
    enabledFeatures: context.enabledFeatures,
  }).filter(isUserManagementRole);
}

function assertAssignableRoleForCompany(
  role: UserManagementRole,
  context: { workspaceProfile: string | null; enabledFeatures: string[] },
) {
  const allowedRoles = getAllowedAssignableRoles(context);
  if (!allowedRoles.includes(role)) {
    throw new Error(
      `Selected role ${role} is not available for this company's enabled features.`,
    );
  }
}

function assertManagedLifecycleTarget(user: { role: string; email: string }) {
  if (user.role === "SUPERADMIN") {
    throw new Error(
      `User ${user.email} is SUPERADMIN. SUPERADMIN lifecycle must be managed in the Admins module.`,
    );
  }
}

async function assertHasActiveSuperadmin(companyId: string) {
  const count = await prisma.user.count({
    where: {
      companyId,
      role: "SUPERADMIN",
      isActive: true,
    },
  });
  if (count < 1) {
    throw new Error(
      `Guardrail: company ${companyId} has zero active SUPERADMIN users. Restore one active SUPERADMIN first.`,
    );
  }
}

function mapUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  companyId: string;
  createdAt: Date;
  updatedAt: Date;
  company?: { name: string } | null;
}): UserSummary {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    isActive: row.isActive,
    companyId: row.companyId,
    companyName: row.company?.name ?? null,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

export async function listUsers(input?: ListUsersInput): Promise<UserSummary[]> {
  const where: Prisma.UserWhereInput = {
    role: {
      in: [...USER_MANAGEMENT_ROLES],
    },
  };

  if (input?.companyId) {
    where.companyId = input.companyId;
  }
  if (input?.status) {
    where.isActive = normalizeEnum(input.status, "status", USER_ACCOUNT_STATUSES) === "ACTIVE";
  }
  if (input?.role) {
    const role = normalizeEnum(input.role, "role", USER_MANAGEMENT_ROLES);
    where.role = role;
  }

  const search = input?.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { id: search },
    ];
  }

  const rows = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
    orderBy: [{ companyId: "asc" }, { name: "asc" }],
    take: input?.limit ?? 100,
    skip: input?.skip ?? 0,
  });

  return rows.map(mapUser);
}

export async function createUser(input: CreateUserInput): Promise<UserCreateResult> {
  const company = await getCompanyRoleContext(input.companyId);
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  await assertHasActiveSuperadmin(input.companyId);

  const email = normalizeEmail(input.email);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("User name cannot be empty.");
  const normalizedPassword = normalizePasswordInput(input.password, "Password");
  const role = normalizeAssignableRole(input.role || "CLERK");
  assertAssignableRoleForCompany(role, company);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new Error(`User already exists for email: ${email}`);

  const password = await bcrypt.hash(normalizedPassword, 12);
  const user = await prisma.user.create({
    data: {
      companyId: input.companyId,
      email,
      name,
      password,
      role,
      isActive: true,
    },
    select: {
      id: true,
      companyId: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "USER_CREATE",
    entityType: "user",
    entityId: user.id,
    companyId: user.companyId,
    reason: `Created user ${user.email}`,
    after: { role: user.role, isActive: user.isActive },
  });

  return {
    id: user.id,
    companyId: user.companyId,
    companyName: company.name,
    email: user.email,
    name: user.name,
    role: user.role as UserRole,
    isActive: user.isActive,
    createdAt: formatDate(user.createdAt),
    auditEventId: audit.id,
  };
}

export async function setUserStatus(input: SetUserStatusInput & { isActive: boolean }): Promise<UserStatusResult> {
  const before = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });
  if (!before) throw new Error(`User not found for id: ${input.userId}`);

  assertManagedLifecycleTarget({ role: before.role, email: before.email });
  await assertHasActiveSuperadmin(before.companyId);

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { isActive: input.isActive },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
  });

  await assertHasActiveSuperadmin(updated.companyId);

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: input.isActive ? "USER_ACTIVATE" : "USER_DEACTIVATE",
    entityType: "user",
    entityId: updated.id,
    companyId: updated.companyId,
    reason: input.reason ?? null,
    before: { isActive: before.isActive },
    after: { isActive: updated.isActive },
  });

  return {
    userId: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role as UserRole,
    isActive: updated.isActive,
    companyId: updated.companyId,
    companyName: updated.company.name,
    updatedAt: formatDate(updated.updatedAt),
    auditEventId: audit.id,
  };
}

export async function resetUserPassword(input: ResetUserPasswordInput): Promise<UserResetPasswordResult> {
  const normalizedPassword = normalizePasswordInput(input.newPassword, "New password");

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      role: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });
  if (!user) throw new Error(`User not found for id: ${input.userId}`);

  assertManagedLifecycleTarget({ role: user.role, email: user.email });
  await assertHasActiveSuperadmin(user.companyId);

  const password = await bcrypt.hash(normalizedPassword, 12);
  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { password },
    select: { updatedAt: true },
  });

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "USER_RESET_PASSWORD",
    entityType: "user",
    entityId: user.id,
    companyId: user.companyId,
    reason: input.reason ?? "Password reset via Ink TUI",
  });

  return {
    userId: user.id,
    email: user.email,
    role: user.role as UserRole,
    companyId: user.companyId,
    companyName: user.company.name,
    updatedAt: formatDate(updated.updatedAt),
    auditEventId: audit.id,
  };
}

export async function changeUserRole(input: ChangeUserRoleInput): Promise<UserRoleChangeResult> {
  const afterRole = normalizeAssignableRole(input.role);
  const before = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      company: { select: { name: true } },
    },
  });
  if (!before) throw new Error(`User not found for id: ${input.userId}`);

  assertManagedLifecycleTarget({ role: before.role, email: before.email });
  await assertHasActiveSuperadmin(before.companyId);
  const company = await getCompanyRoleContext(before.companyId);
  if (!company) throw new Error(`Organization not found for id: ${before.companyId}`);
  assertAssignableRoleForCompany(afterRole, company);

  const beforeRole = normalizeEnum(before.role, "role", USER_MANAGEMENT_ROLES);
  if (beforeRole === afterRole) {
    throw new Error(`User ${before.email} is already ${afterRole}.`);
  }

  const updated = await prisma.user.update({
    where: { id: input.userId },
    data: { role: afterRole },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      companyId: true,
      updatedAt: true,
      company: { select: { name: true } },
    },
  });

  await assertHasActiveSuperadmin(updated.companyId);

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "USER_CHANGE_ROLE",
    entityType: "user",
    entityId: updated.id,
    companyId: updated.companyId,
    reason: input.reason ?? null,
    before: { role: beforeRole },
    after: { role: afterRole },
  });

  return {
    userId: updated.id,
    email: updated.email,
    name: updated.name,
    beforeRole,
    afterRole,
    isActive: updated.isActive,
    companyId: updated.companyId,
    companyName: updated.company.name,
    updatedAt: formatDate(updated.updatedAt),
    auditEventId: audit.id,
  };
}
