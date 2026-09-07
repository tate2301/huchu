/**
 * Registries the kernel keeps and never fills.
 *
 * A host composes itself at boot (`modules.ts`, imported from
 * `instrumentation.ts`) by registering into these: NextAuth's options, the
 * capability sets of the modules it composes, and the module manifests as they
 * arrive. The storage hangs off `globalThis` under a symbol, for the reason the
 * Prisma client's does: a hot reload in development re-evaluates the module
 * that declares a registry, and a bundle that carries a second copy of that
 * module must still see the one set of registrations.
 */
const KEY = Symbol.for("./registries");

type Registries = Map<string, unknown>;

function registries(): Registries {
  const holder = globalThis as unknown as Record<symbol, Registries | undefined>;
  return (holder[KEY] ??= new Map());
}

export function registry<T>(name: string, create: () => T): T {
  const all = registries();
  if (!all.has(name)) all.set(name, create());
  return all.get(name) as T;
}
