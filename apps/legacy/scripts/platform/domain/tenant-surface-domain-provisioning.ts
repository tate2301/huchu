import { promises as fs } from "node:fs";
import path from "node:path";

type VercelProjectConfig = {
  projectId: string;
  orgId: string;
};

type ProvisionTenantSurfaceDomainsInput = {
  companyId: string;
  tenantSubdomain: string;
};

type ProvisionTenantSurfaceDomainsResult = {
  provisionedDomains: string[];
  warnings: string[];
  provisioned: boolean;
  providerRef: string | null;
};

const VERCEL_API_BASE = "https://api.vercel.com";

function normalize(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function toTenantSubdomain(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function readLinkedProjectConfig(): Promise<VercelProjectConfig | null> {
  try {
    const filePath = path.join(process.cwd(), ".vercel", "project.json");
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { projectId?: string; orgId?: string };
    const projectId = String(parsed.projectId || "").trim();
    const orgId = String(parsed.orgId || "").trim();
    if (!projectId || !orgId) {
      return null;
    }
    return { projectId, orgId };
  } catch {
    return null;
  }
}

async function resolveVercelContext() {
  const envProjectId = String(process.env.PLATFORM_VERCEL_PROJECT_ID || "").trim();
  const envTeamId = String(process.env.PLATFORM_VERCEL_TEAM_ID || "").trim();
  const token = String(process.env.PLATFORM_VERCEL_TOKEN || "").trim();

  if (envProjectId && envTeamId) {
    return { projectId: envProjectId, teamId: envTeamId, token };
  }

  const linked = await readLinkedProjectConfig();
  return {
    projectId: envProjectId || linked?.projectId || "",
    teamId: envTeamId || linked?.orgId || "",
    token,
  };
}

function isAlreadyAssignedResponse(status: number, code: string, message: string) {
  const normalizedCode = normalize(code);
  const normalizedMessage = normalize(message);
  return (
    status === 409 ||
    normalizedCode.includes("domain") ||
    normalizedCode.includes("already") ||
    normalizedCode.includes("taken") ||
    normalizedMessage.includes("already") ||
    normalizedMessage.includes("taken")
  );
}

async function addDomainToVercelProject(input: {
  projectId: string;
  teamId: string;
  token: string;
  domain: string;
}) {
  const endpoint = `${VERCEL_API_BASE}/v10/projects/${encodeURIComponent(input.projectId)}/domains?teamId=${encodeURIComponent(input.teamId)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: input.domain }),
  });

  if (response.ok) {
    return { ok: true as const, warning: null as string | null };
  }

  let code = "";
  let message = "";
  try {
    const payload = (await response.json()) as { error?: { code?: string; message?: string } };
    code = String(payload.error?.code || "");
    message = String(payload.error?.message || "");
  } catch {
    message = await response.text();
  }

  if (isAlreadyAssignedResponse(response.status, code, message)) {
    return { ok: true as const, warning: `Domain ${input.domain} already assigned.` };
  }

  return {
    ok: false as const,
    warning: `Domain ${input.domain} provisioning failed (${response.status}): ${message || code || "unknown error"}`,
  };
}

export async function provisionTenantSurfaceDomains(
  input: ProvisionTenantSurfaceDomainsInput,
): Promise<ProvisionTenantSurfaceDomainsResult> {
  const warnings: string[] = [];
  const provisionedDomains: string[] = [];

  const rootDomain = normalize(process.env.PLATFORM_ROOT_DOMAIN);
  if (!rootDomain) {
    warnings.push("PLATFORM_ROOT_DOMAIN is not configured; skipped tenant wildcard provisioning.");
    return { provisionedDomains, warnings, provisioned: false, providerRef: null };
  }

  const tenantSubdomain = toTenantSubdomain(input.tenantSubdomain);
  if (!tenantSubdomain) {
    warnings.push(`Invalid tenant subdomain for company ${input.companyId}; skipped wildcard provisioning.`);
    return { provisionedDomains, warnings, provisioned: false, providerRef: null };
  }

  const { projectId, teamId, token } = await resolveVercelContext();
  if (!projectId || !teamId || !token) {
    warnings.push(
      "Missing Vercel provisioning credentials (PLATFORM_VERCEL_PROJECT_ID, PLATFORM_VERCEL_TEAM_ID, PLATFORM_VERCEL_TOKEN). Skipped wildcard domain provisioning.",
    );
    return { provisionedDomains, warnings, provisioned: false, providerRef: null };
  }

  const domains = [`${tenantSubdomain}.${rootDomain}`, `*.${tenantSubdomain}.${rootDomain}`];
  for (const domain of domains) {
    const result = await addDomainToVercelProject({ projectId, teamId, token, domain });
    if (result.ok) {
      provisionedDomains.push(domain);
      if (result.warning) {
        warnings.push(result.warning);
      }
    } else if (result.warning) {
      warnings.push(result.warning);
    }
  }

  const wildcardDomain = `*.${tenantSubdomain}.${rootDomain}`;
  const provisioned = provisionedDomains.includes(wildcardDomain);
  const providerRef = provisionedDomains.length > 0 ? provisionedDomains.join(",") : null;
  return { provisionedDomains, warnings, provisioned, providerRef };
}
