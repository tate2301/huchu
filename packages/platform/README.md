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
- NextAuth's options themselves stay in the host (`apps/legacy/lib/auth.ts`):
  they name the host's providers and adapter, and one callback asks the retail
  module a question.
