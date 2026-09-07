import pathlib, re
ROOT = pathlib.Path("/home/user/huchu")
def edit(path, old, new, count=1):
    p = ROOT / path; s = p.read_text(); n = s.count(old)
    assert n == count, f"{path}: expected {count} of {old[:50]!r}, found {n}"
    p.write_text(s.replace(old, new)); print("edited", path)

ROW = ("| 2026-09-06 | — | **Phase 3.1b-3 executed: the kernel's routes, the auth options and the proxy are kernel code; the workspace pages are the shell's.** "
       "The last of the host's hand-written surface that a product host would otherwise copy. The kernel's route handlers — sign-in, the credentials "
       "precheck, ids, onboarding, preferences, branding settings, sites, uploads, users, health, pricing, the workspace icon — live in "
       "`packages/platform/api`, composed like a module's (`pnpm compose apps/legacy platform`). NextAuth's options are a kernel factory "
       "(`createAuthOptions()` in `auth-core/create-auth-options`): the one thing they asked the retail module — which roles may sign in on the till's "
       "host — is data in the module's manifest now. The edge proxy is the kernel's too (`createProxy()` in `platform/proxy`), and what a module "
       "contributed to it is manifest data: `portals` (the school's three and the till, with the roles whose home they are, the roles they admit, the "
       "paths the till serves bare and whether its roles are pinned to its host) and `roleRestrictedRoutes` (people and payroll for the workforce "
       "roles); a host's `proxy.ts` is the manifests, `createProxy()` and the matcher Next reads statically. The workspace pages — sign-in, "
       "access blocked, help, status, the preview-host control page, preferences, the users console, the master-data hub — and their components are "
       "the shell's (`packages/shell/pages`, `preferences/`, `user-management/`, `status/`, `branding/`, `onboarding/`), with the two preference "
       "screens that belong to a module (departments to people, notification preferences to notifications) in their modules. The host keeps by "
       "hand what is the host's: the operator console and its API, the executive dashboard, the marketing site, the payment webhooks, the "
       "cross-module search, the report hub, the root layout and page, and the composition files. |\n")
edit("docs/rollout/product-split-plan.md", "| Date | Commit | Description |\n|---|---|---|\n", "| Date | Commit | Description |\n|---|---|---|\n" + ROW)

edit("README.md",
     "What is written by hand here: the kernel's routes (until 3.1b-3), the workspace pages, the marketing site (`app/home`), the admin console, the executive dashboard, the cross-module search. |",
     "The kernel's routes (`packages/platform/api`) and the workspace pages (`packages/shell/pages`) are composed the same way (`pnpm compose apps/legacy platform shell …`). What is written by hand here: the marketing site (`app/home`), the operator console (`app/admin`, `app/portal/admin`, `app/api/platform-admin`), the executive dashboard, the payment webhooks, the cross-module search, the report hub, and the root layout and page. |")

edit("AGENTS.md",
     "Every module's routes and pages have moved; what `apps/legacy/app/` still holds by hand is the kernel's routes (until they move to `packages/platform/api`), the workspace pages, the marketing site, the admin console, the executive dashboard and the cross-module search.",
     "The kernel's routes live in `packages/platform/api/**` and the workspace pages (sign-in, preferences, the users console, the master-data hub, help, status, access blocked, the preview-host page) in `packages/shell/pages/**`, composed the same way (`pnpm compose apps/legacy platform shell …`); what `apps/legacy/app/` holds by hand is the marketing site, the operator console, the executive dashboard, the payment webhooks, the cross-module search, the report hub, and the root layout and page.")
edit("AGENTS.md",
     "declaring what it contributes — `requires`, gated `routes`, `permissions.capabilities`, more sections as they are needed.",
     "declaring what it contributes — `requires`, gated `routes`, `permissions.capabilities`, `records.types`, `documents.templates`, `notifications`, `portals` (a portal host the module serves: the roles whose home it is, the roles it admits at sign-in, the paths it serves bare, whether its roles are pinned to it) and `roleRestrictedRoutes` (paths only some roles may reach); the kernel's proxy and auth options read the last two from the registry, so a host's `proxy.ts` is `createProxy()` over its manifests and its `lib/auth.ts` is `createAuthOptions()`.")

edit("docs/rollout/product-split-deployment.md",
     "  `pnpm compose apps/legacy <module>` and commit the regenerated files; the app's typecheck fails\n  on a stale re-export rather than serving one.\n",
     "  `pnpm compose apps/legacy <module>` and commit the regenerated files; the app's typecheck fails\n  on a stale re-export rather than serving one. The kernel's routes (`packages/platform/api`) and\n  the workspace pages (`packages/shell/pages`) compose the same way (`platform`, `shell` as ids).\n- The edge proxy and NextAuth's options are the kernel's (`createProxy()`, `createAuthOptions()`);\n  the host's `proxy.ts` keeps only the matcher and `lib/auth.ts` only the call. Same behaviour,\n  same environment variables; what the retail module told them is manifest data now.\n")

edit("packages/platform/README.md",
     "client/, hooks/     the browser's clients for the kernel's own endpoints (sites, ids, users) and the reserved-id hook\n",
     "client/, hooks/     the browser's clients for the kernel's own endpoints (sites, ids, users, managed users) and the reserved-id hook\napi/                the kernel's route handlers (sign-in, ids, onboarding, preferences, settings, sites, uploads, users, health, pricing), composed into a host like a module's\nproxy               the edge proxy every host runs (`createProxy()`), over the manifests the host registered\nauth-core/create-auth-options   NextAuth's options (`createAuthOptions()`); a host builds them once and registers them\nv2-collection       the empty collection response a v2 endpoint returns while its resource has no listing\n")
edit("packages/platform/README.md",
     "- NextAuth's options themselves stay in the host (`apps/legacy/lib/auth.ts`):\n  they name the host's providers and adapter, and one callback asks the retail\n  module a question.\n",
     "- NextAuth's options and the edge proxy are the kernel's, and what a module\n  contributes to either is manifest data (`portals`, `roleRestrictedRoutes`):\n  the kernel reads the registry, never the module. A host builds the options\n  once (`createAuthOptions()`), registers them, and composes the proxy\n  (`createProxy()`) under the matcher Next reads statically from its own file.\n")

edit("packages/shell/README.md",
     "management-shell, master-data-page, master-data-shell   the Management chrome and the master-data pattern\n",
     "management-shell, master-data-page, master-data-shell   the Management chrome and the master-data pattern\npages/            the workspace pages a host composes: sign-in, access blocked, help, status, the preview-host page, preferences, the users console, the master-data hub\npreferences/, user-management/, status/, branding/, onboarding/   what those pages render\n")
print("done")
