import type { NextAuthOptions } from "next-auth";
import { registry } from "../registry";

/**
 * How the host authenticates.
 *
 * NextAuth's options name the host's providers, adapter and secret, and one of
 * its callbacks asks the retail module a question, so the kernel does not own
 * them. It asks the host for them through this registry instead. The provider
 * is read on every call and may be lazy: the app's test setup registers one
 * that imports the options on first use, so a test's own mocks still apply.
 */
export type AuthOptionsProvider = () => NextAuthOptions | Promise<NextAuthOptions>;

const slot = registry<{ provider: AuthOptionsProvider | null }>("auth-options", () => ({ provider: null }));

export function registerAuthOptions(provider: AuthOptionsProvider): void {
  slot.provider = provider;
}

export async function resolveAuthOptions(): Promise<NextAuthOptions> {
  if (!slot.provider) {
    throw new Error(
      "No auth options registered. The host registers them at boot: registerAuthOptions(() => authOptions) in modules.ts, imported from instrumentation.ts.",
    );
  }
  return slot.provider();
}
