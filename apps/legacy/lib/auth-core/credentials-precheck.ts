import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  isTenantStatusActive,
  resolveTenantFromHost,
} from "@/lib/platform/tenant";

export type CredentialsPrecheckFailure = {
  error: string;
  code: string;
  message: string;
  status: number;
};

export async function getCredentialsPrecheckFailure(
  headers: Headers,
): Promise<CredentialsPrecheckFailure | null> {
  const hostHeader = getHostHeaderFromRequestHeaders(headers);
  const hostContext = getPlatformHostContext(hostHeader);

  if (!hostContext.strictTenantEnforcement) {
    return null;
  }

  if (hostContext.isCentralHost) {
    return {
      error: "TENANT_HOST_REQUIRED",
      code: "TENANT_HOST_REQUIRED",
      message: "Use your organization URL to sign in.",
      status: 403,
    };
  }

  const tenant = await resolveTenantFromHost(hostHeader);
  if (!tenant) {
    return {
      error: "TENANT_NOT_FOUND",
      code: "TENANT_NOT_FOUND",
      message: "This organization URL is not recognized.",
      status: 403,
    };
  }

  if (!isTenantStatusActive(tenant.tenantStatus)) {
    return {
      error: "TENANT_INACTIVE",
      code: "TENANT_INACTIVE",
      message: "This organization is currently inactive.",
      status: 403,
    };
  }

  return null;
}
