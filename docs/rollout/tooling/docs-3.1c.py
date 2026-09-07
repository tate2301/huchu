import pathlib, re, json
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:50]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)

ROW = ("| 2026-09-06 | — | **Phase 3.1c executed: `apps/campus`, the Campus host.** The first product host, and the proof of the shape: a module list and "
       "the files that are this host's own. `manifests.ts` composes workflow, notifications, offline, records, documents, books, people, compliance and "
       "the school; `modules.ts` wires the people module's approval notices, the school's record guard, the school and staff search arms, the school, "
       "payslip and books document sources, the school's fiscal drain issuer and sweep, and the compliance incident a stuck drain raises; "
       "`modules.client.ts` registers the offline scope (the workforce essentials). Its `proxy.ts` is the kernel's `createProxy()` over those manifests "
       "with the matcher Next reads statically; its `lib/auth.ts` is `createAuthOptions()`. Its own data: the navigation (the school, people, payroll, "
       "the books, the reports it serves, settings), the management areas (branding, the school's and HR master data, compliance, users, templates), "
       "the workspace catalogue (the school, people, payroll, accounting, management, reporting; the SCHOOLS, PAYROLL and GENERAL profiles), the offline "
       "modules and workflows for the workforce. The app shell renders the shell's sidebar and navbar with this host's model, the notification centre "
       "and the offline status — no CRM shelves, no stock locations query; the root page sends a signed-in person to their workspace home and everyone "
       "else to sign-in; there is no marketing site and robots disallow everything. Everything a tenant reaches under `app/` is composed "
       "(`pnpm compose apps/campus platform shell campus books compliance documents notifications people records offline`). The runbook's §7 is the "
       "Campus host's actual setup: a Vercel project on this repository with Root Directory `apps/campus`, the wildcard `*.campus.corelith.co.zw`, "
       "`PLATFORM_ROOT_DOMAIN=campus.corelith.co.zw`, the same `NEXTAUTH_SECRET` and `DATABASE_URL` as the enterprise host. Until the owner creates it "
       "nothing runs; production is untouched. CI builds one app at a time now that there are two. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)

edit("README.md",
     "| `apps/legacy/` | The application as it ships today — every module in one Next.js host. Renamed to `apps/enterprise` once the products have their own hosts. |\n",
     "| `apps/legacy/` | The application as it ships today — every module in one Next.js host. Renamed to `apps/enterprise` once the products have their own hosts. |\n| `apps/campus/` | The Campus host: the school product on its own Vercel project and host, composed from the school module and what it requires (books, compliance, people, documents, notifications, records, workflow, offline). A module list, its own navigation and catalogue, the kernel's proxy and auth; everything under its `app/` is composed. `pnpm campus <script>` runs its scripts. |\n")
edit("AGENTS.md",
     "- `apps/legacy/` is the application as it ships today: one Next.js host composing every module.\n",
     "- `apps/legacy/` is the application as it ships today: one Next.js host composing every module. `apps/campus/` is the first product host: the same shape with a shorter module list — its own `manifests.ts`, `modules.ts`, `modules.client.ts`, navigation, management data, workspace catalogue and offline scope, the kernel's `createProxy()` and `createAuthOptions()`, and an `app/` tree that is composed (`pnpm compose apps/campus platform shell campus …`). A change that touches host composition is made in both hosts; a module change reaches both through the packages.\n")

# the runbook's §7: from a preview to the Campus host's setup
p = ROOT / "docs/rollout/product-split-deployment.md"; s = p.read_text()
a = s.index("## 7. Phase 3 preview: what a product host will need"); b = s.index("## 8. Checklist")
s = s[:a] + '''## 7. The Campus host (`apps/campus`): what it needs

The first product host exists in the repository (`apps/campus`, Phase 3.1c). It ships as its
own Vercel project on its own root, from the same repository and the same database. None of
this runs until the project owner creates the project; production keeps serving from
`apps/legacy` untouched.

1. **Vercel project** from this repository with *Root Directory* `apps/campus` (keep "include
   files outside the root" on: the packages and the lockfile live above it), *Ignored Build
   Step* `npx turbo-ignore`, the same Node version as the enterprise project. The build command
   is the package's `pnpm build`; the app reads the repository-root `.env` as the enterprise
   host does.
2. **Domains**: the wildcard `*.campus.corelith.co.zw` on the Campus project. The bare
   `campus.corelith.co.zw` is the product's landing site, which is already its own project.
   **Verify on the account that a bare host and its wildcard may sit on different projects**
   (add `*.campus.corelith.co.zw` to the Campus project while `campus.corelith.co.zw` stays on
   the landing site's, and confirm both certificates issue). If Vercel refuses, the landing
   site moves into the Campus host as its root route instead.
3. **DNS**: `*.campus.corelith.co.zw` → Vercel (CNAME), alongside the existing bare record.
4. **Environment variables** (Production, and Preview with the preview-host overrides from
   `STAGING_PREVIEW.md`):
   - `PLATFORM_ROOT_DOMAIN=campus.corelith.co.zw` and `PLATFORM_ROOT_HOSTS` to match;
   - the **same** `NEXTAUTH_SECRET` and `DATABASE_URL` as the enterprise host — one database,
     one session token; the cookie domain becomes `.corelith.co.zw` so a sign-in carries
     across hosts;
   - `FEATURE_GATE_POLICY=deny` and its public twin, the fiscalisation settings the school
     needs (the FDMS provider configuration), `PLATFORM_VERCEL_*` for its own project if it
     provisions portal hosts.
5. **Portal hosts** (`parents-<slug>.campus.corelith.co.zw`, `students-…`, `staff-…`) are one
   label on the new root, so the wildcard certificate covers them and self-serve signup needs
   no Vercel API call. The enterprise host keeps today's three-label pattern.
6. **The database release job stays singular.** Products share the database; migrations keep
   landing from `packages/db` through the one job, expand-first, because hosts deploy
   independently. The Campus host has no migrations of its own.
7. **Cut-over per tenant**: add the Campus host to the tenant's `allowedHosts`, 308 the old
   paths from the enterprise host, remove the school from the enterprise host's list — the
   flip described in the plan's Phase 3.
8. **What the Campus host does not serve**: the marketing site (its own project), the operator
   console (`apps/legacy`'s `/admin`, on the admin host), the executive dashboard, the CRM, the
   till, stock, maintenance and the mine. A school tenant that also runs one of those stays on
   the enterprise host until that product has a host of its own.

''' + s[b:]
p.write_text(s); print("edited docs/rollout/product-split-deployment.md")

# root scripts: the second host by name
pj = ROOT / "package.json"; d = json.loads(pj.read_text())
d["scripts"]["campus"] = "pnpm --filter @corelithzw/campus run"
d["scripts"]["dev:campus"] = "turbo run dev --filter=@corelithzw/campus"
pj.write_text(json.dumps(d, indent=2) + "\n"); print("edited package.json")
# CI: one app build at a time, now that there are two
edit(".github/workflows/ci.yml",
     "        run: pnpm turbo run build ${{ github.event_name == 'pull_request' && '--affected' || '' }}\n",
     "        # Two hosts build here now; one at a time, for the runner's memory.\n        run: pnpm turbo run build --concurrency=1 ${{ github.event_name == 'pull_request' && '--affected' || '' }}\n")
print("done")
