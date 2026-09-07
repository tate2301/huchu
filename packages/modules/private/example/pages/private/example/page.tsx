import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";

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
