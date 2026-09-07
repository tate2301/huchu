# @corelithzw/platform

The kernel: what every host and every module stands on and none of them own.

```
tenant, entitlements, features, feature-catalog, client-templates, subscription, personas, …
                    tenancy, and what a tenant may use
gating/             route registry, capability registry, enforcer, token checks, the nav filter
auth-core/          guards, the lean API guard, token sessions, role routes, session claims and policy
admin-portal(.ts)   the control-plane host: who is a superuser, which host is the admin portal
permission-catalog  what a person may do: features from entitlements, capabilities from the modules
registry            the registries a host fills at boot
manifest            the module manifest contract and the modules a host composes
client/, hooks/     the browser's clients for the kernel's own endpoints (sites, ids, users, managed users) and the reserved-id hook
api/                the kernel's route handlers (sign-in, ids, onboarding, preferences, settings, sites, uploads, users, health, pricing), composed into a host like a module's
proxy               the edge proxy every host runs (`createProxy()`), over the manifests the host registered
auth-core/create-auth-options   NextAuth's options (`createAuthOptions()`); a host builds them once and registers them
v2-collection       the empty collection response a v2 endpoint returns while its resource has no listing
auth-core/session-shape   next-auth's session, user and token typed from the kernel's claims
roles, public-routes, api-utils, api-response, api-client, logging, observability/
id-generator, money, serialize-decimals, uploads/, preferences/, audit/, workspace-products
```

Import by path: `import { validateSession } from "@corelithzw/platform/api-utils"`.

## Rules

- Depends on `@corelithzw/db` and nothing else in the workspace: never on a
  module, never on a host.
- The kernel never names a module or a host. Where it needs what only they
  know, it keeps a registry they fill: `registerAuthOptions` for how the host
  authenticates, `registerCapabilities` for what its modules let a person do,
  the module manifests as they arrive. A host fills them at boot in its
  `modules.ts`, imported from `instrumentation.ts`; a test that reads a
  registry imports the same file.
- NextAuth's options and the edge proxy are the kernel's, and what a module
  contributes to either is manifest data (`portals`, `roleRestrictedRoutes`):
  the kernel reads the registry, never the module. A host builds the options
  once (`createAuthOptions()`), registers them, and composes the proxy
  (`createProxy()`) under the matcher Next reads statically from its own file.
