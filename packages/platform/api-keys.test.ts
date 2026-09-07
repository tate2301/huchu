import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
