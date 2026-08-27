# Local dev performance — findings

Measured on the working tree at `C:\Users\pc\work\huchu`, Next.js 16.1.1 (Turbopack),
Node 26.7.0, 12-core i7-9750H, 17 GB RAM. Graph evidence from `graphify-out/graph.json`
(16,764 nodes / 54,194 edges) plus a source-derived module graph that separates
*value* imports (what Turbopack compiles) from *type-only* imports (what `tsc` checks).

Tooling written for this investigation lives in `scratch/`:
`graphq.py`, `filegraph.py`, `modgraph.mjs`, `pkgreach.mjs`, `bench-dev.sh`.

---

## Measured baseline

| Metric | Value |
|---|---|
| `next dev` ready | **32.3 s** (cold, `.next` deleted) |
| First request `/login` | **75 s** — compile 67 s, render 8.3 s |
| Same route, warm | **0.27 s** (compile 27 ms) |
| Dev-server node RSS after one route | **7.9 GB** |
| `npx tsc --noEmit` cold | **5 m 42 s**, and the first run **crashed with V8 OOM** |
| tsc program size | **6,616 files** — 4,180 of them `node_modules` `.d.ts` |
| Own source | 2,399 files / 526k LOC / 9,198 value edges |

The shape of the problem: **warm compile is 27 ms, cold compile is 67 s**. Nothing is
wrong with incremental rebuild. Everything is wrong with the cold path, and the cold
path is what you pay on every `.next` wipe, branch switch, and config change.

---

## 1. `lib/api-utils.ts` — the single worst chokepoint

**592 files import it** (the next-highest is 95). Its value closure is 34 modules /
7,274 LOC, because `validateSession` drags in the entire auth + platform-gating graph:

```
lib/api-utils.ts
  -> lib/auth-core/guards.ts -> lib/auth.ts -> lib/platform/tenant.ts
     -> lib/platform/entitlements.ts -> lib/platform/gating/route-registry.ts
     -> lib/platform/feature-catalog.ts (898 LOC) -> lib/prisma.ts
```

Blast radius (importers × closure LOC) = **4.3 M**, seven times the next module.

Measured breakdown of those 592 importers:

| Import pattern | Files | Actually needs the auth graph? |
|---|---|---|
| `validateSession` (+ helpers) | 545 | yes |
| **helpers only** — `errorResponse`, `successResponse`, `getPaginationParams`, `isValidUUID` | **47** | **no** |

Those 47 route files pay for the whole auth/prisma/gating closure to use four pure
functions. `errorResponse` and `successResponse` between them depend on nothing but
`next/server` and `serialize-decimals`.

**Fix:** split the file. `lib/api-response.ts` gets the pure helpers (closure: 2
modules); `lib/api-utils.ts` keeps `validateSession` and re-exports nothing. Then
repoint the 47 pure-only importers. Zero behaviour change, and it shrinks the compile
input for 47 API routes from 7,274 LOC to ~150.

The remaining 545 are a deeper question — see §5.

---

## 2. `app/layout.tsx` pulls 32,531 LOC into every single page

Root layout value closure: **135 modules / 32,531 LOC**. Every route in the app waits
on this before it can render. Two chains are doing real damage:

```
app/layout.tsx -> components/layout/app-shell.tsx -> components/layout/app-sidebar.tsx
  -> components/layout/app-sidebar/sidebar-crm-collections.tsx
    -> lib/crm/crm-v2.ts (1,092 LOC)
      -> lib/crm/site-visits.ts -> lib/crm/accounting-bridge.ts (650 LOC)
        -> lib/accounting/posting.ts (683) -> lib/accounting/bootstrap.ts (920 LOC)
```

The **accounting posting engine is in the root layout's compile graph** because the
sidebar renders a list of CRM saved views. Also `app/layout.tsx -> lib/marketing/seo.ts
-> lib/marketing/pricing.ts` (1,092 LOC) — marketing pricing tables loaded for every
authenticated app page.

**Fix, in order of payoff:**
- `sidebar-crm-collections.tsx` only calls `fetchCrmLists` / `fetchCrmSavedViews`. Those
  are thin `fetchJson` wrappers. Move them to a small `lib/crm/collections-client.ts`
  so the sidebar stops importing the 1,092-LOC `crm-v2` barrel and its accounting tail.
- `lib/marketing/seo.ts` should not reach `pricing.ts` for `getSiteUrl()`. Split the URL
  helper out.
- Consider `next/dynamic` for the sidebar's CRM section — it is below the fold and
  session-gated anyway.

---

## 3. `lib/icons.tsx` — 4,543 of the 4,755 npm files reachable from `/login`

`lib/icons.tsx` does:

```ts
import * as Phosphor from "@phosphor-icons/react/ssr";
const iconRegistry = Phosphor as unknown as Record<string, PhosphorIconComponent>;
function getIconComponent(name: string) { return iconRegistry[name] ?? Phosphor.Question; }
```

That SSR barrel is `1,513` re-export statements over 3,026 files. The package is **not**
in Next's default `optimizePackageImports` list (verified against
`node_modules/next/dist/server/config.js:931` — the list has `lucide-react`,
`@heroicons/*`, `@tabler/icons-react`, but no `@phosphor-icons/react`).

Package reach for `app/login/page.tsx` — a login form:

| Package | JS files reachable |
|---|---|
| **@phosphor-icons/react** | **4,543** |
| next-auth | 139 |
| @prisma/client | 36 |
| everything else | 37 |
| **total** | **4,755** |

**291 of your 999 routes** reach `lib/icons.tsx`. Only **162 distinct Phosphor icons**
are actually referenced — 89.3% of the barrel is dead weight.

### I tested the obvious fix, and it made things worse — do not do it

I rewrote `lib/icons.tsx` to 162 explicit deep imports
(`@phosphor-icons/react/dist/ssr/<Name>`, a valid export subpath) and benchmarked it:

| Variant | Ready | Cold `/login` compile |
|---|---|---|
| baseline (namespace import) | 32.3 s | **67 s** |
| 162 deep imports | 61.2 s | **3.6 min** |

Turbopack handles one barrel better than 162 separate module resolutions in dev. The
change is fully reverted (`lib/icons.tsx` is clean in git).

**What to do instead:** add the package to `optimizePackageImports`, which is the
mechanism Next built for exactly this and which applies the transform at the right
layer:

```ts
// next.config.ts
experimental: {
  optimizePackageImports: ["@phosphor-icons/react", "@corelithzw/react", "@visx/xychart"],
},
```

Caveat worth stating plainly: the dynamic `iconRegistry[iconName]` lookup means a
static analyser cannot prove which icons are used, so the optimiser may not be able to
prune through it. The registry exists to serve `createPhosphorIcon("ShareNetwork", …)`
call sites that pass icon names as strings. Converting those 162 call sites to direct
component references would make the module statically analysable — but given the deep-
import result above, **measure before committing to it**.

---

## 4. `tsc` is checking 4,180 dependency type files and running out of heap

`npx tsc --noEmit` took 5m42s and OOM'd V8 on the first run. The program is 6,616 files;
only 2,436 are yours.

`tsconfig.json` has `"skipLibCheck": true` already, but `include` is
`["**/*.ts", "**/*.tsx", "**/*.mts", ...]` from the repo root, and `exclude` is only
`["node_modules"]`.

**Fixes:**
- Raise the heap for typechecking. Add to `package.json`:
  ```json
  "typecheck": "node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc --noEmit"
  ```
  This alone stops the crash.
- `"incremental": true` is set but `tsBuildInfoFile` is not, so the `.tsbuildinfo` lands
  at the repo root and gets clobbered. Point it into `.next/cache/`.
- Add `scripts/`, `e2e/`, and `design/` to `exclude` unless you genuinely typecheck them
  in the same pass — `scripts/platform/services.ts` alone is 2,551 LOC with a 45-module
  closure and is never imported by the app.

There are also **7 real type errors** currently on `main`, all in
`components/schools/portal/student/student-library-screen.tsx` — missing `EmptyState`,
`Skeleton`, and `getApiErrorMessage` imports. That file is broken right now.

---

## 5. Structural: 545 API routes each compile the full auth graph

Beyond the 47 easy wins in §1, the deeper cost is that `validateSession` is imported
directly by 545 route files, so every one of them roots a 34-module closure that ends at
`lib/prisma.ts` and the platform feature catalog.

Because Next compiles routes on demand in dev, you pay this per route you visit, and the
closures overlap almost entirely — meaning Turbopack does redundant graph work across
545 entry points.

The architectural fix is to move session validation **into `proxy.ts`** (which already
imports the tenant/gating graph and already runs on every request) and have routes read
an already-validated session off the request. That collapses 545 duplicate closures into
one. This is a real refactor, not a config change — flagging it as the highest-leverage
structural item, not a quick win.

---

## 6. Windows-specific

- **Defender is scanning the build.** `MsMpEng` was live during every measurement. Add
  exclusions for `node_modules`, `.next`, and the pnpm store. This is typically worth
  20–30% on Windows Turbopack cold builds and costs nothing to try.
- `rm -rf .next` plus repeated Turbopack runs drove the MSYS layer into
  `fork: Resource temporarily unavailable` twice during this session. Prefer letting
  Turbopack's incremental cache do its job over wiping `.next`.
- The `.next` filesystem cache write itself takes **37–42 s** on this machine.

---

## Recommended order

| # | Change | Effort | Confidence |
|---|---|---|---|
| 1 | Defender exclusions for `node_modules` / `.next` | 2 min | high, untested here |
| 2 | `--max-old-space-size=8192` typecheck script | 2 min | **verified need** — it OOM'd |
| 3 | Fix the 7 broken imports in `student-library-screen.tsx` | 10 min | **verified** |
| 4 | Split `lib/api-utils.ts`; repoint the 47 pure importers | 1 h | **verified** 47 files |
| 5 | `optimizePackageImports` for phosphor/corelith/visx | 15 min | measure — §3 |
| 6 | Cut `crm-v2` + `marketing/pricing` out of the root layout | 2–3 h | **verified** chains |
| 7 | Move `validateSession` into `proxy.ts` | days | structural, §5 |

Items 2, 3, 4, and 6 rest on measurements in this document. Item 5 needs a benchmark
before you trust it — the intuitive version of that fix tripled compile time.
