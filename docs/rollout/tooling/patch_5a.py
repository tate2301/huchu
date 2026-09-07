import pathlib, json
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:60]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)
def write(path, s):
    p = ROOT / path; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(s); print("wrote", path)

edit("pnpm-workspace.yaml", "  - packages/modules/*\n", "  - packages/modules/*\n  # A client's own module, when a contract pays for one: composed only into that client's host.\n  - packages/modules/private/*\n")

edit("scripts/compose-host.mjs", ''' * `platform` names the kernel (`packages/platform`, its routes under `api/`),
 * `shell` the workspace chrome (`packages/shell`, its pages under `pages/`);
 * any other id is a module under `packages/modules`.''', ''' * `platform` names the kernel (`packages/platform`, its routes under `api/`),
 * `shell` the workspace chrome (`packages/shell`, its pages under `pages/`);
 * `private/<id>` a client's own module (`packages/modules/private/<id>`,
 * `@corelithzw/private-<id>`), composed only into that client's host; any
 * other id is a module under `packages/modules`.''')
edit("scripts/compose-host.mjs", '''/** Where a package lives and what it is called: the kernel and the shell by name, a module under packages/modules. */
function packageOf(id) {
  if (id === "platform") return { dir: "packages/platform", name: "@corelithzw/platform" };
  if (id === "shell") return { dir: "packages/shell", name: "@corelithzw/shell" };
  return { dir: `packages/modules/${id}`, name: `@corelithzw/module-${id}` };
}''', '''/** Where a package lives and what it is called: the kernel and the shell by name, a private module under packages/modules/private, a module under packages/modules. */
function packageOf(id) {
  if (id === "platform") return { dir: "packages/platform", name: "@corelithzw/platform" };
  if (id === "shell") return { dir: "packages/shell", name: "@corelithzw/shell" };
  if (id.startsWith("private/")) return { dir: `packages/modules/${id}`, name: `@corelithzw/private-${id.slice("private/".length)}` };
  return { dir: `packages/modules/${id}`, name: `@corelithzw/module-${id}` };
}''')

edit("packages/platform/testing/module-boundary.ts", '''const MODULE_PREFIX = "@corelithzw/module-";''', '''const MODULE_PREFIX = "@corelithzw/module-";
/** A client's own module: `@corelithzw/private-<id>` carries the manifest id `private-<id>`, and is declared like any other. */
const PRIVATE_PREFIX = "@corelithzw/private-";''')
edit("packages/platform/testing/module-boundary.ts", '''      } else if (specifier.startsWith(MODULE_PREFIX)) {
        const id = specifier.slice(MODULE_PREFIX.length).split("/")[0];
        if (id !== input.manifest.id && !declared.has(id)) {
          violations.push({ file: shown, specifier, reason: `imports module "${id}", which the manifest does not require` });
        }
      }''', '''      } else if (specifier.startsWith(MODULE_PREFIX) || specifier.startsWith(PRIVATE_PREFIX)) {
        const id = specifier.startsWith(PRIVATE_PREFIX)
          ? `private-${specifier.slice(PRIVATE_PREFIX.length).split("/")[0]}`
          : specifier.slice(MODULE_PREFIX.length).split("/")[0];
        if (id !== input.manifest.id && !declared.has(id)) {
          violations.push({ file: shown, specifier, reason: `imports module "${id}", which the manifest does not require` });
        }
      }''')
edit("packages/platform/testing/module-boundary.ts", " * A module imports the kernel packages, npm, and the modules its manifest\n * declares in `requires`.", " * A module imports the kernel packages, npm, and the modules its manifest\n * declares in `requires` (a private module, `@corelithzw/private-<id>`, is one).")

# --- the example: the shape a client's module takes, and the proof the mechanism composes
E = "packages/modules/private/example"
write(f"{E}/package.json", json.dumps({
    "name": "@corelithzw/private-example", "version": "0.0.0", "private": True,
    "description": "The shape a client's own module takes: a manifest, a route and a page, composed only into that client's host. An example, never composed into a public product.",
    "main": "./index.ts", "types": "./index.ts",
    "scripts": {"lint": "eslint", "typecheck": "tsc --noEmit -p tsconfig.json", "test": "vitest run"},
    "dependencies": {"@corelithzw/db": "workspace:*", "@corelithzw/platform": "workspace:*", "@corelithzw/ui": "workspace:*"},
    "peerDependencies": {"next": "16.1.1", "react": "19.2.3", "react-dom": "19.2.3"},
    "devDependencies": {"@corelithzw/config": "workspace:*", "@types/node": "^20", "@types/react": "^19", "@types/react-dom": "^19", "dotenv": "^17.2.3",
                        "eslint": "^9", "eslint-config-next": "16.1.1", "next": "16.1.1", "react": "19.2.3", "react-dom": "19.2.3", "typescript": "5.9.3", "vitest": "^4.1.4"},
}, indent=2) + "\n")
write(f"{E}/tsconfig.json", '''{
  "extends": "@corelithzw/config/tsconfig/nextjs.json",
  "compilerOptions": {
    "types": ["vitest/globals"]
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
''')
write(f"{E}/eslint.config.mjs", '''import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// The same rules as the hosts and the modules, so a client's module reads the same.
export default defineConfig([...nextVitals, ...nextTs, globalIgnores(["node_modules/**"])]);
''')
write(f"{E}/vitest.config.ts", '''import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules"],
  },
});
''')
write(f"{E}/vitest.setup.ts", '''// The repository-root .env, as the hosts read it (a .env beside this package
// wins), then the test database before Prisma creates its pool.
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../../../.env")], quiet: true });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
''')
write(f"{E}/manifest.ts", '''import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * A client's own module declares itself exactly as a product module does. Its
 * id carries the `private-` prefix, which no public module's ever does, so the
 * registries and the boundary test tell the two apart by name alone.
 *
 * The route is gated by a feature key like any other. A real client module's
 * key is the one its contract grants — a bundle the tenant holds — and until
 * a module's bundles live in its manifest (see the plan's Phase 5 decisions)
 * that bundle is declared in the kernel's catalogue. This example gates on a
 * key every tenant has.
 */
export const manifest: ModuleManifest = {
  id: "private-example",
  routes: [
    { scope: "page", prefix: "/private/example", featureKey: "core.auth.login" },
    { scope: "api", prefix: "/api/v2/private/example", featureKey: "core.auth.login" },
  ],
};
''')
write(f"{E}/index.ts", '''// A private module's entry carries its manifest, as a product module's does;
// its host imports the manifest by path (`@corelithzw/private-example/manifest`).
export { manifest } from "./manifest";
''')
write(f"{E}/api/v2/private/example/route.ts", '''import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";

/**
 * A client module's route reads the session through the kernel, never a
 * host's `authOptions`: composed into `apps/enterprise-<client>`, it answers
 * on `/api/v2/private/example` for that client's tenants and nobody else's.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    return successResponse({ module: "private-example", companyId: session.user.companyId });
  } catch (error) {
    console.error("[API] GET /api/v2/private/example error:", error);
    return errorResponse("Failed to read the example module");
  }
}
''')
write(f"{E}/pages/private/example/page.tsx", '''import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";

/**
 * A client module's page, on the path the host serves it at. The host's
 * composed `app/private/example/page.tsx` re-exports this file; the workspace
 * chrome around it is the shell's, as for every module.
 */
export default async function PrivateExamplePage() {
  const session = await getCurrentAuthSession();
  return (
    <section className="space-y-2 px-6 py-8">
      <h1 className="text-lg font-semibold">Example module</h1>
      <p className="text-sm text-muted-foreground">
        Composed into this host for {session?.user.companySlug ?? "this tenant"} only.
      </p>
    </section>
  );
}
''')
write(f"{E}/module-boundary.test.ts", '''import { describe, expect, it } from "vitest";
import { moduleBoundaryViolations } from "@corelithzw/platform/testing/module-boundary";
import { manifest } from "./manifest";

describe("module boundary", () => {
  it("imports only the kernel and the modules it declares", () => {
    expect(moduleBoundaryViolations({ dir: __dirname, manifest })).toEqual([]);
  });

  it("carries the private prefix no public module has", () => {
    expect(manifest.id.startsWith("private-")).toBe(true);
  });
});
''')
write(f"{E}/README.md", '''# @corelithzw/private-example

The shape a client's own module takes when a contract pays for custom code, and the
proof that the mechanism composes. It is never composed into a public product: no
public host lists it, and a private module never enters a public build because no
public host lists it.

## The mechanism

- **Where it lives**: `packages/modules/private/<id>`, package `@corelithzw/private-<id>`,
  manifest id `private-<id>`. The workspace's `packages/modules/private/*` glob picks it
  up; the boundary test (`module-boundary.test.ts`) holds it to the kernel, npm and the
  modules its manifest requires, exactly as a product module.
- **Who owns it**: the client's developers, through `.github/CODEOWNERS`
  (`/packages/modules/private/<id>/ @<their-team>`) and branch protection; or the module
  lives in their repository and is pulled in as a git dependency — either works without
  publishing anything.
- **Where it runs**: a dedicated host, `apps/enterprise-<client>`, generated from the
  enterprise host by the host scaffold with the module list it needs plus `private/<id>`,
  and composed with `pnpm compose apps/enterprise-<client> platform shell <modules…>
  private/<id>`. Its `manifests.ts` registers the private manifest by path
  (`@corelithzw/private-<id>/manifest`); its `modules.ts` wires the hooks the module
  fills. The host is its own Vercel project on the client's root, per the runbook's §7.
- **What it may do**: everything a product module may — routes under `api/`, pages under
  `pages/`, records, documents, notifications, a search arm, document sources — declared
  in its manifest and wired by its host. Its feature key is the one the client's contract
  grants; until a module's bundles live in its manifest, that bundle is declared in the
  kernel's catalogue.

## This example

`manifest.ts` declares one page (`/private/example`) and one route
(`/api/v2/private/example`), both gated on a key every tenant holds; the route answers
with the caller's company, the page names the tenant. `pnpm --filter
@corelithzw/private-example typecheck|lint|test` run as for any module.
''')

# --- CODEOWNERS: the door a client's developers come through, documented where GitHub reads it
write(".github/CODEOWNERS", '''# Code owners. Empty of assignments on purpose: the repository is one team's.
#
# A client's own module (packages/modules/private/<id>, see
# packages/modules/private/example/README.md) is the one place another team
# owns code here. Give them their folder and nothing else, one line each:
#
#   /packages/modules/private/<id>/   @<org>/<their-team>
#
# With branch protection requiring owner review, their changes to their module
# need their approval, and their access stops at the folder's edge.
''')

# --- docs
edit("README.md", "| `packages/modules/` | The modules, one package each (`@corelithzw/module-<id>`), each with a data-only manifest the host composes with. All fourteen: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`, `gold`, `campus`, `sell`, `crm`. |\n",
     "| `packages/modules/` | The modules, one package each (`@corelithzw/module-<id>`), each with a data-only manifest the host composes with. All fourteen: `workflow`, `notifications`, `records`, `documents`, `books`, `people`, `stock`, `maintenance`, `compliance`, `offline`, `gold`, `campus`, `sell`, `crm`. |\n| `packages/modules/private/` | A client's own module when a contract pays for one (`@corelithzw/private-<id>`, manifest id `private-<id>`), composed only into that client's host (`apps/enterprise-<client>`), never a public product. `example/` is the shape and the proof; its README is the mechanism. |\n")
edit("AGENTS.md", "- `packages/config/` holds shared TypeScript presets; `packages/modules/` receives modules as they are extracted.\n",
     "- `packages/config/` holds shared TypeScript presets; `packages/modules/` receives modules as they are extracted.\n- `packages/modules/private/<id>/` is a client's own module (`@corelithzw/private-<id>`, manifest id `private-<id>`): the same contract and boundary as a product module, composed only into that client's host (`pnpm compose apps/enterprise-<client> … private/<id>`), owned through `.github/CODEOWNERS`. `private/example` is the shape; no public host lists a private module, so none enters a public build.\n")
ROW = ("| 2026-09-07 | — | **Phase 5a executed: the private-module mechanism.** A client's own module lives at `packages/modules/private/<id>` as "
       "`@corelithzw/private-<id>` with manifest id `private-<id>` (a prefix no public module has); the workspace glob picks it up, the composer "
       "takes `private/<id>` and writes its routes and pages into the client's host, and the boundary test holds it to the kernel and the modules it "
       "declares exactly as a product module — and holds a product module from importing it. `packages/modules/private/example` is the shape and the "
       "proof (a manifest with a gated page and route, a boundary test, a README that is the mechanism); `.github/CODEOWNERS` documents the door a "
       "client's developers come through, empty of assignments. A private module never enters a public build because no public host lists it. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)
print("done")
