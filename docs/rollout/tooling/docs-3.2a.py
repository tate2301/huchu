import pathlib, json
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:50]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)

ROW = ("| 2026-09-06 | — | **Phase 3.2a executed: `apps/sell`, the Sell host.** The second product host, generated from the legacy host by the same "
       "scripted spec that produced the Campus host (the spec reproduces `apps/campus` byte for byte, which is the proof that a host is a module list and "
       "its own data). `manifests.ts` composes workflow, notifications, offline, records, documents, books, people, stock, maintenance, compliance and "
       "the till; `modules.ts` wires the people module's approval notices, the staff and shop search arms, the payslip and books document sources, and "
       "the compliance incident a stuck fiscal drain raises; `modules.client.ts` registers the till's offline module and workflow beside the workforce "
       "essentials. Its own data: the navigation (the shop, its customers, stores, maintenance, people, payroll, the books, the reports those modules "
       "serve, settings), the management areas (branding, HR master data, compliance, users, templates), the workspace catalogue (retail with its feature "
       "gate and the stock-transfer rule, stores, maintenance, people, payroll, accounting, management, reporting; the RETAIL, PAYROLL and GENERAL "
       "profiles), the offline scope. The app shell keeps the stock-locations query the retail sidebar needs and the POS portal path; no CRM shelves. "
       "Its search route runs the shop's and the staff directory's arms. The thrift dashboard route (`/api/v2/thrift`, retail's) moved from the legacy "
       "host's hand-written leftovers into the sell module's `api/`, so both hosts compose it. 401 composed files. The runbook's §7 is now the product "
       "hosts' table — one row per host, the same steps — and states what the kernel does with portal hosts today: `prefix.slug.root`, two labels under "
       "a product root, which the one wildcard does not cover; the one-label form the plan describes is Phase 3.3, before any portal host serves from a "
       "product root. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)

edit("README.md",
     "| `apps/campus/` | The Campus host: the school product on its own Vercel project and host, composed from the school module and what it requires (books, compliance, people, documents, notifications, records, workflow, offline). A module list, its own navigation and catalogue, the kernel's proxy and auth; everything under its `app/` is composed. `pnpm campus <script>` runs its scripts. |\n",
     "| `apps/campus/` | The Campus host: the school product on its own Vercel project and host, composed from the school module and what it requires (books, compliance, people, documents, notifications, records, workflow, offline). A module list, its own navigation and catalogue, the kernel's proxy and auth; everything under its `app/` is composed. `pnpm campus <script>` runs its scripts. |\n"
     "| `apps/sell/` | The Sell host: the retail product on its own Vercel project and host, composed from the sell module and what it requires (stock, maintenance, compliance, books, people, documents, notifications, records, workflow, offline). The same shape as the Campus host. `pnpm sell <script>` runs its scripts. |\n")
edit("AGENTS.md",
     "- `apps/legacy/` is the application as it ships today: one Next.js host composing every module. `apps/campus/` is the first product host: the same shape with a shorter module list — its own `manifests.ts`, `modules.ts`, `modules.client.ts`, navigation, management data, workspace catalogue and offline scope, the kernel's `createProxy()` and `createAuthOptions()`, and an `app/` tree that is composed (`pnpm compose apps/campus platform shell campus …`). A change that touches host composition is made in both hosts; a module change reaches both through the packages.\n",
     "- `apps/legacy/` is the application as it ships today: one Next.js host composing every module. `apps/campus/` and `apps/sell/` are product hosts: the same shape with a shorter module list — each its own `manifests.ts`, `modules.ts`, `modules.client.ts`, navigation, management data, workspace catalogue and offline scope, the kernel's `createProxy()` and `createAuthOptions()`, a search route with the arms of the modules it runs, and an `app/` tree that is composed (`pnpm compose apps/<host> platform shell <modules…>`; the command is in each host's README). A change that touches host composition is made in every host; a module change reaches them all through the packages.\n")

p = ROOT / "docs/rollout/product-split-deployment.md"; s = p.read_text()
a = s.index("## 7. The Campus host (`apps/campus`): what it needs"); b = s.index("## 8. Checklist")
s = s[:a] + '''## 7. The product hosts (`apps/<product>`): what each needs

Each product host in the repository ships as its own Vercel project on its own root, from the
same repository and the same database. None of them runs until the project owner creates the
project; production keeps serving from `apps/legacy` untouched.

| Host | Since | Root Directory | Wildcard host | `PLATFORM_ROOT_DOMAIN` | Composes |
|---|---|---|---|---|---|
| Campus | 3.1c | `apps/campus` | `*.campus.corelith.co.zw` | `campus.corelith.co.zw` | the school, books, compliance, people, documents, notifications, records, workflow, offline |
| Sell | 3.2a | `apps/sell` | `*.sell.corelith.co.zw` | `sell.corelith.co.zw` | the till, stock, maintenance, compliance, books, people, documents, notifications, records, workflow, offline |

1. **Vercel project** from this repository with *Root Directory* from the table (keep "include
   files outside the root" on: the packages and the lockfile live above it), *Ignored Build
   Step* `npx turbo-ignore`, the same Node version as the enterprise project. The build command
   is the package's `pnpm build`; the app reads the repository-root `.env` as the enterprise
   host does.
2. **Domains**: the wildcard from the table on the product's project. The bare
   `<product>.corelith.co.zw` is the product's landing site, which is already its own project.
   **Verify on the account that a bare host and its wildcard may sit on different projects**
   (add the wildcard to the product's project while the bare host stays on the landing site's,
   and confirm both certificates issue). If Vercel refuses, the landing site moves into the
   product host as its root route instead.
3. **DNS**: the wildcard → Vercel (CNAME), alongside the existing bare record.
4. **Environment variables** (Production, and Preview with the preview-host overrides from
   `STAGING_PREVIEW.md`):
   - `PLATFORM_ROOT_DOMAIN` from the table and `PLATFORM_ROOT_HOSTS` to match;
   - the **same** `NEXTAUTH_SECRET` and `DATABASE_URL` as the enterprise host — one database,
     one session token; the cookie domain becomes `.corelith.co.zw` so a sign-in carries
     across hosts;
   - `FEATURE_GATE_POLICY=deny` and its public twin; the fiscalisation settings (the FDMS
     provider configuration) on every host that fiscalises — the school's fee receipts on
     Campus, the till on Sell; `PLATFORM_VERCEL_*` for its own project if it provisions portal
     hosts.
5. **Portal hosts.** The kernel forms a portal host as `<prefix>.<slug>.<root>` today
   (`students.`, `parents.`, `staff.` for the school, `pos.` for the till — see
   `packages/platform/portal-hosts.ts`). On a product root that is two labels under the root,
   which the one wildcard certificate does **not** cover: a portal host there needs its own
   certificate, issued through the Vercel API as the enterprise host's portal hosts are today.
   The plan's one-label form (`parents-<slug>.campus.corelith.co.zw`, `pos-<slug>.sell.…`),
   which the wildcard covers and which frees self-serve signup from the Vercel API call, is
   Phase 3.3 — a host-level switch in the kernel, off on the enterprise host — and lands
   before any portal host is served from a product root.
6. **The database release job stays singular.** Products share the database; migrations keep
   landing from `packages/db` through the one job, expand-first, because hosts deploy
   independently. No product host has migrations of its own.
7. **Cut-over per tenant**: add the product host to the tenant's `allowedHosts`, 308 the old
   paths from the enterprise host, remove the module from the enterprise host's list — the
   flip described in the plan's Phase 3.
8. **What a product host does not serve**: the marketing site (its own project), the operator
   console (`apps/legacy`'s `/admin`, on the admin host), the executive dashboard, the payment
   webhooks, and every module outside its list — the Campus host has no till, stock, CRM,
   maintenance or mine; the Sell host has no school, CRM or mine. A tenant that runs a module
   from two products stays on the enterprise host until both products have hosts.

''' + s[b:]
p.write_text(s); print("edited docs/rollout/product-split-deployment.md")

pj = ROOT / "package.json"; d = json.loads(pj.read_text())
d["scripts"]["sell"] = "pnpm --filter @corelithzw/sell run"
d["scripts"]["dev:sell"] = "turbo run dev --filter=@corelithzw/sell"
pj.write_text(json.dumps(d, indent=2) + "\n"); print("edited package.json")
edit("packages/modules/sell/README.md", "", "", count=0) if False else None
print("done")
