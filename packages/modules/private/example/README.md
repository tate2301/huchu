# @corelithzw/private-example

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
