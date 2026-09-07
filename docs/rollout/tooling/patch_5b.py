import pathlib, re
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:60]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)
def write(path, s):
    p = ROOT / path; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(s); print("wrote", path)

# --- the schema
edit("packages/db/prisma/schema/platform.prisma", "  crmApiKeys                    CrmApiKey[]\n", "  crmApiKeys                    CrmApiKey[]\n  platformApiKeys               PlatformApiKey[]\n")
edit("packages/db/prisma/schema/platform.prisma", '  crmApiKeysCreated                 CrmApiKey[]                    @relation("CrmApiKeyCreatedBy")\n',
     '  crmApiKeysCreated                 CrmApiKey[]                    @relation("CrmApiKeyCreatedBy")\n  platformApiKeysCreated            PlatformApiKey[]               @relation("PlatformApiKeyCreatedBy")\n')
p = ROOT / "packages/db/prisma/schema/platform.prisma"; p.write_text(p.read_text().rstrip("\n") + '''

/// A tenant's key for the public API, sent as `Authorization: Bearer cz_…`.
/// The plaintext is shown once at creation; only its sha256 hash is stored.
/// `scopes` are the feature keys the key may reach: a route that serves
/// outside developers asks `authenticateApiKey(request, scope)`, which needs
/// the key to carry the scope and the tenant to hold the feature. Generalised
/// from the CRM's intake keys (`CrmApiKey`) to every module, per the plan.
model PlatformApiKey {
  id          String    @id @default(uuid())
  companyId   String
  name        String
  keyPrefix   String
  keyHash     String    @unique
  scopes      String[]
  lastUsedAt  DateTime?
  revokedAt   DateTime?
  createdById String?
  createdAt   DateTime  @default(now())

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  createdBy User?   @relation("PlatformApiKeyCreatedBy", fields: [createdById], references: [id])

  @@index([companyId, revokedAt])
}
'''); print("appended PlatformApiKey")

# --- the kernel
write("packages/platform/api-keys.ts", '''/**
 * A tenant's keys for the public API.
 *
 * `CrmApiKey` let a lead-capture form post into one module. This is the same
 * idea for every module: a key is minted by a workspace admin, carries the
 * feature keys it may reach (`scopes`), and is sent as
 * `Authorization: Bearer cz_…`. A route that serves outside developers asks
 * `authenticateApiKey(request, scope)` and gets the tenant back — or the
 * response that explains why not: no key, an unknown or revoked key, a scope
 * the key does not carry, a feature the tenant does not hold.
 *
 * The plaintext is shown once at creation; only its sha256 hash is stored, and
 * the first eleven characters (`cz_` and eight hex) are kept as a display
 * prefix so a person can tell their keys apart.
 */
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse } from "./api-response";
import { hasFeature } from "./features";

export const API_KEY_PREFIX = "cz_";
const KEY_BYTES = 20; // → 40 hex characters
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8;

export type ApiKeyPrincipal = {
  keyId: string;
  companyId: string;
  scopes: string[];
};

export function generatePlatformApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(KEY_BYTES).toString("hex")}`;
  return { key, prefix: key.slice(0, DISPLAY_PREFIX_LENGTH), hash: hashPlatformApiKey(key) };
}

export function hashPlatformApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

/** The key a request carries: `Authorization: Bearer cz_…`, or `x-api-key` for clients that cannot set the former. */
export function readBearerApiKey(request: { headers: Headers }): string | null {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearer = /^Bearer\\s+(.+)$/i.exec(authorization)?.[1]?.trim();
  const candidate = bearer || request.headers.get("x-api-key")?.trim() || "";
  return candidate.startsWith(API_KEY_PREFIX) ? candidate : null;
}

/**
 * Resolve a raw key to the tenant and scopes it stands for, or null. Touches
 * `lastUsedAt` as a fire-and-forget side effect, so a revoked key's last use
 * is on record.
 */
export async function verifyPlatformApiKey(rawKey: string | null | undefined): Promise<ApiKeyPrincipal | null> {
  if (!rawKey || !rawKey.startsWith(API_KEY_PREFIX)) return null;
  const row = await prisma.platformApiKey.findUnique({
    where: { keyHash: hashPlatformApiKey(rawKey) },
    select: { id: true, companyId: true, scopes: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  void prisma.platformApiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { keyId: row.id, companyId: row.companyId, scopes: row.scopes };
}

/**
 * The gate a public route stands behind. Both axes are checked, as the session
 * gate checks them: the key must carry the scope (what the admin let this key
 * do) and the tenant must hold the feature (what the tenant bought). A 401 says
 * "no valid key", a 403 says which of the two refused, with a `code` a client
 * can act on.
 */
export async function authenticateApiKey(
  request: { headers: Headers },
  scope: string,
): Promise<{ principal: ApiKeyPrincipal } | NextResponse> {
  const rawKey = readBearerApiKey(request);
  if (!rawKey) return errorResponse("An API key is required", 401, { code: "API_KEY_REQUIRED" });
  const principal = await verifyPlatformApiKey(rawKey);
  if (!principal) return errorResponse("The API key is unknown or revoked", 401, { code: "API_KEY_INVALID" });
  if (!principal.scopes.includes(scope)) {
    return errorResponse(`The API key does not carry the scope ${scope}`, 403, { code: "API_KEY_SCOPE", scope });
  }
  if (!(await hasFeature(principal.companyId, scope))) {
    return errorResponse(`This workspace does not hold ${scope}`, 403, { code: "FEATURE_DISABLED", scope });
  }
  return { principal };
}
''')
write("packages/platform/api/v2/api-keys/route.ts", '''import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@corelithzw/db/client";
import { generatePlatformApiKey } from "../../../api-keys";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../api-utils";
import { getFeatureMap } from "../../../features";

/**
 * A workspace's API keys: what exists, and minting one. The plaintext comes
 * back once, in the creation response, and never again.
 *
 * A scope is a feature key the tenant holds: a key cannot be given more than
 * the workspace has, so an admin sees the same list the sidebar is built from.
 */
const KEY_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  scopes: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string().trim().min(1).max(120)).min(1).max(200),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const keys = await prisma.platformApiKey.findMany({
      where: { companyId: session.user.companyId },
      select: KEY_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return successResponse({ data: keys });
  } catch (error) {
    console.error("[API] GET /api/v2/api-keys error:", error);
    return errorResponse("Failed to fetch API keys");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return errorResponse("A name and at least one scope are required", 400, parsed.error.flatten());
    const scopes = Array.from(new Set(parsed.data.scopes));
    const features = await getFeatureMap(session.user.companyId);
    const unheld = scopes.filter((scope) => features[scope] !== true);
    if (unheld.length > 0) {
      return errorResponse("A key cannot carry a scope this workspace does not hold", 400, { code: "SCOPE_NOT_HELD", scopes: unheld });
    }

    const { key, prefix, hash } = generatePlatformApiKey();
    const created = await prisma.platformApiKey.create({
      data: {
        companyId: session.user.companyId,
        name: parsed.data.name,
        keyPrefix: prefix,
        keyHash: hash,
        scopes,
        createdById: session.user.id,
      },
      select: KEY_SELECT,
    });
    return successResponse({ data: { ...created, key } }, 201);
  } catch (error) {
    console.error("[API] POST /api/v2/api-keys error:", error);
    return errorResponse("Failed to create the API key");
  }
}
''')
write("packages/platform/api/v2/api-keys/[id]/route.ts", '''import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@corelithzw/db/client";
import { errorResponse, hasRole, successResponse, validateSession } from "../../../../api-utils";

/** Revoking a key. The row stays, with its last use, so the audit reads whole. */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) return errorResponse("Manager access required", 403);

    const { id } = await context.params;
    const existing = await prisma.platformApiKey.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, revokedAt: true },
    });
    if (!existing) return errorResponse("API key not found", 404);
    if (!existing.revokedAt) {
      await prisma.platformApiKey.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    }
    return successResponse({ data: { id: existing.id, revoked: true } });
  } catch (error) {
    console.error("[API] DELETE /api/v2/api-keys/[id] error:", error);
    return errorResponse("Failed to revoke the API key");
  }
}
''')
edit("packages/platform/gating/route-registry.ts", '  { scope: "api", prefix: "/api/users", featureKey: "admin.user-management.directory" },\n',
     '  { scope: "api", prefix: "/api/users", featureKey: "admin.user-management.directory" },\n  // Minting keys is an admin act on a feature every tenant holds; the routes check the role.\n  { scope: "api", prefix: "/api/v2/api-keys", featureKey: "core.auth.login" },\n')

# --- the preferences page and its nav entry
edit("packages/platform/preferences/nav.ts", '''  {
    id: "sites",
    group: "organization",
    label: "Sites",''', '''  {
    id: "api-keys",
    group: "organization",
    label: "API keys",
    href: "/preferences/organization/api-keys",
    description: "Keys for the public API, scoped to what this workspace holds.",
  },
  {
    id: "sites",
    group: "organization",
    label: "Sites",''')
edit("packages/platform/preferences/nav.ts", '''  if (itemId === "sites") {
    return isOrgAdminRole(role) && hasTokenFeature(enabledFeatures, "admin.sites-sections");
  }''', '''  if (itemId === "api-keys") return role === "SUPERADMIN" || role === "MANAGER";
  if (itemId === "sites") {
    return isOrgAdminRole(role) && hasTokenFeature(enabledFeatures, "admin.sites-sections");
  }''')
t = ROOT / "packages/platform/preferences/nav.test.ts"; s = t.read_text()
s = s.replace('''      "organization",
      "users",
      "sites",
      "departments",
      "branding",
      "templates",
      "billing",''', '''      "organization",
      "users",
      "api-keys",
      "sites",
      "departments",
      "branding",
      "templates",
      "billing",''').replace('''      "organization",
      "users",
      "sites",
      "departments",
      "billing",''', '''      "organization",
      "users",
      "api-keys",
      "sites",
      "departments",
      "billing",''')
assert s.count('"api-keys"') == 2; t.write_text(s); print("edited nav.test.ts")
write("packages/shell/pages/preferences/organization/api-keys/page.tsx", '''import { ApiKeysPreferences } from "../../../../preferences/organization/api-keys-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesApiKeysPage() {
  await requirePreferencesAccess("api-keys");

  return (
    <PreferencesShell
      title="API keys"
      description="Keys for the public API. Each carries the features it may reach; the plaintext is shown once."
    >
      <ApiKeysPreferences />
    </PreferencesShell>
  );
}
''')
write("packages/shell/preferences/organization/api-keys-preferences.tsx", '''"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Alert, Badge, Button, Field, Input } from "@corelithzw/react";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A workspace's API keys: mint one against the features the workspace holds,
 * read the plaintext once, revoke it when it is done. The scopes offered are
 * the session's enabled features, which is the same list the sidebar is built
 * from, so a key can never be given more than the workspace has.
 */
export function ApiKeysPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const enabledFeatures = React.useMemo(
    () => [...((session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures ?? [])].sort(),
    [session],
  );

  const [name, setName] = React.useState("");
  const [scopes, setScopes] = React.useState<string[]>([]);
  const [filter, setFilter] = React.useState("");
  const [revealed, setRevealed] = React.useState<{ name: string; key: string } | null>(null);

  const keysQuery = useQuery({
    queryKey: ["preferences", "organization", "api-keys"],
    queryFn: () => fetchJson<{ data: ApiKeyRow[] }>("/api/v2/api-keys"),
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; scopes: string[] }) =>
      fetchJson<{ data: ApiKeyRow & { key: string } }>("/api/v2/api-keys", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result) => {
      setRevealed({ name: result.data.name, key: result.data.key });
      setName("");
      setScopes([]);
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "api-keys"] });
    },
    onError: (error) => toast({ title: "Could not create the key", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => fetchJson<{ data: { id: string } }>(`/api/v2/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Key revoked" });
      void queryClient.invalidateQueries({ queryKey: ["preferences", "organization", "api-keys"] });
    },
    onError: (error) => toast({ title: "Could not revoke the key", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  async function revoke(row: ApiKeyRow) {
    const confirmed = await dsConfirm({
      title: "Revoke API key",
      description: `${row.name} (${row.keyPrefix}…) stops working at once; the row stays for the audit.`,
      variant: "warning",
      confirmLabel: "Revoke",
    });
    if (confirmed) revokeMutation.mutate(row.id);
  }

  const visibleFeatures = enabledFeatures.filter((key) => !filter || key.includes(filter.trim().toLowerCase()));
  const rows = keysQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      {revealed ? (
        <Alert tone="success" title={`Key created: ${revealed.name}`}>
          <p className="text-sm">Copy it now. It is shown once and cannot be recovered.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 text-sm">{revealed.key}</code>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(revealed.key);
                toast({ title: "Copied" });
              }}
            >
              Copy
            </Button>
            <Button type="button" variant="ghost" onClick={() => setRevealed(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}

      <form
        className="space-y-4 rounded-lg border border-border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || scopes.length === 0) {
            toast({ title: "A name and at least one scope are required", variant: "destructive" });
            return;
          }
          createMutation.mutate({ name: name.trim(), scopes });
        }}
      >
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Warehouse sync" required />
        </Field>
        <Field label="Scopes" required>
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter features…" />
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded border border-border p-2">
            {visibleFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">No features match.</p>
            ) : (
              visibleFeatures.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(key)}
                    onChange={(event) =>
                      setScopes((current) => (event.target.checked ? [...current, key] : current.filter((item) => item !== key)))
                    }
                  />
                  <span>{key}</span>
                </label>
              ))
            )}
          </div>
        </Field>
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating…" : "Create key"}
        </Button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Prefix</th>
              <th className="py-2 pr-4 font-medium">Scopes</th>
              <th className="py-2 pr-4 font-medium">Last used</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-muted-foreground" colSpan={6}>
                  {keysQuery.isPending ? "Loading…" : "No API keys yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="py-2 pr-4">{row.name}</td>
                  <td className="py-2 pr-4">
                    <code>{row.keyPrefix}…</code>
                  </td>
                  <td className="py-2 pr-4">
                    {row.scopes.length} scope{row.scopes.length === 1 ? "" : "s"}
                  </td>
                  <td className="py-2 pr-4">{formatDate(row.lastUsedAt)}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={row.revokedAt ? "outline" : "success"}>{row.revokedAt ? "Revoked" : "Active"}</Badge>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {row.revokedAt ? null : (
                      <Button type="button" variant="secondary" onClick={() => void revoke(row)} disabled={revokeMutation.isPending}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
''')
# the management "Users" area lists the keys page in every host
for host in ("enterprise", "campus", "sell", "crm", "people"):
    edit(f"apps/{host}/lib/settings/management-nav.ts", '    { id: "role-change", label: "Role Change", href: "/preferences/organization/users", icon: UserCheck },\n',
         '    { id: "role-change", label: "Role Change", href: "/preferences/organization/users", icon: UserCheck },\n    { id: "api-keys", label: "API Keys", href: "/preferences/organization/api-keys", icon: ShieldCheck },\n')

# --- tests
write("packages/platform/api-keys.test.ts", '''import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";
import {
  API_KEY_PREFIX,
  authenticateApiKey,
  generatePlatformApiKey,
  hashPlatformApiKey,
  readBearerApiKey,
  verifyPlatformApiKey,
} from "./api-keys";

const withHeaders = (headers: Record<string, string>) => ({ headers: new Headers(headers) });

describe("api keys, without a database", () => {
  it("mints a prefixed key whose hash, not plaintext, is what gets stored", () => {
    const { key, prefix, hash } = generatePlatformApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key).toHaveLength(API_KEY_PREFIX.length + 40);
    expect(prefix).toBe(key.slice(0, API_KEY_PREFIX.length + 8));
    expect(hash).toBe(hashPlatformApiKey(key));
    expect(hash).not.toContain(key);
    expect(generatePlatformApiKey().key).not.toBe(key);
  });

  it("reads the key from a bearer header or x-api-key, and only a key", () => {
    expect(readBearerApiKey(withHeaders({ authorization: "Bearer cz_abc" }))).toBe("cz_abc");
    expect(readBearerApiKey(withHeaders({ Authorization: "bearer  cz_abc " }))).toBe("cz_abc");
    expect(readBearerApiKey(withHeaders({ "x-api-key": "cz_abc" }))).toBe("cz_abc");
    expect(readBearerApiKey(withHeaders({ authorization: "Bearer eyJ.session.token" }))).toBeNull();
    expect(readBearerApiKey(withHeaders({}))).toBeNull();
  });

  it("refuses a request with no key before touching anything", async () => {
    const result = await authenticateApiKey(withHeaders({}), "core.auth.login");
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
    expect(((await (result as Response).json()) as { details: { code: string } }).details.code).toBe("API_KEY_REQUIRED");
  });
});

describe("api keys, against the database", () => {
  const slug = `api-keys-${Date.now().toString(36)}`;
  let companyId = "";

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: "API keys test", slug } });
    companyId = company.id;
  });

  afterAll(async () => {
    await prisma.platformApiKey.deleteMany({ where: { companyId } }).catch(() => {});
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  });

  async function mint(scopes: string[]) {
    const { key, prefix, hash } = generatePlatformApiKey();
    const row = await prisma.platformApiKey.create({
      data: { companyId, name: `key ${scopes.join(",")}`, keyPrefix: prefix, keyHash: hash, scopes },
    });
    return { key, row };
  }

  it("resolves a live key to its tenant and scopes, and a revoked one to nothing", async () => {
    const { key, row } = await mint(["core.auth.login"]);
    expect(await verifyPlatformApiKey(key)).toMatchObject({ keyId: row.id, companyId, scopes: ["core.auth.login"] });
    expect(await verifyPlatformApiKey(`${API_KEY_PREFIX}${"0".repeat(40)}`)).toBeNull();
    await prisma.platformApiKey.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    expect(await verifyPlatformApiKey(key)).toBeNull();
  });

  it("admits a key on a scope it carries and the tenant holds", async () => {
    const { key, row } = await mint(["core.auth.login"]);
    const result = await authenticateApiKey(withHeaders({ authorization: `Bearer ${key}` }), "core.auth.login");
    expect(result).toMatchObject({ principal: { keyId: row.id, companyId } });
  });

  it("refuses a scope the key does not carry, then a feature the tenant does not hold", async () => {
    const { key } = await mint(["core.auth.login", "crm.core"]);
    const scope = await authenticateApiKey(withHeaders({ authorization: `Bearer ${key}` }), "core.help.quick-tips");
    expect((scope as Response).status).toBe(403);
    expect(((await (scope as Response).json()) as { details: { code: string } }).details.code).toBe("API_KEY_SCOPE");
    const feature = await authenticateApiKey(withHeaders({ authorization: `Bearer ${key}` }), "crm.core");
    expect((feature as Response).status).toBe(403);
    expect(((await (feature as Response).json()) as { details: { code: string } }).details.code).toBe("FEATURE_DISABLED");
  });

  it("refuses an unknown key with a 401", async () => {
    const result = await authenticateApiKey(withHeaders({ "x-api-key": `${API_KEY_PREFIX}${"f".repeat(40)}` }), "core.auth.login");
    expect((result as Response).status).toBe(401);
  });
});
''')

# --- docs
edit("AGENTS.md", "- `packages/modules/private/<id>/` is a client's own module", "- A route that serves outside developers stands behind `authenticateApiKey(request, scope)` from `@corelithzw/platform/api-keys` rather than a session: the key must carry the scope (a feature key the workspace admin gave it) and the tenant must hold the feature. Keys are minted at `/preferences/organization/api-keys` (the kernel's `api/v2/api-keys` routes, composed into every host); the plaintext is shown once, only its hash is stored.\n- `packages/modules/private/<id>/` is a client's own module")
ROW = ("| 2026-09-07 | — | **Phase 5b executed: scoped API keys for every module.** `PlatformApiKey` generalises the CRM's intake keys: minted by a "
       "workspace admin at `/preferences/organization/api-keys` (the kernel's `api/v2/api-keys` routes and the shell's page, composed into every "
       "host, listed in the preferences nav and the management Users area), carrying the feature keys it may reach — never more than the workspace "
       "holds — and sent as `Authorization: Bearer cz_…`. The plaintext is shown once; only the sha256 hash and a display prefix are stored; revoking "
       "keeps the row and its last use. A route that serves outside developers asks `authenticateApiKey(request, scope)` and gets the tenant back or "
       "the response that says why not: 401 for no or an unknown key, 403 with a code for a scope the key does not carry or a feature the tenant "
       "does not hold. Covered by `packages/platform/api-keys.test.ts` against the database. Which routes accept a key is each module's product "
       "decision; the gate exists, and a module adds one line to stand a route behind it. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
print("done")
