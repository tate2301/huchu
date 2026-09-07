export type PortalHostKey = "student" | "parent" | "teacher" | "pos";

export type PortalHostDescriptor = {
  key: PortalHostKey;
  canonicalPrefix: string;
  aliases: string[];
  portalPath: "/portal/student" | "/portal/parent" | "/portal/teacher" | "/portal/pos";
  loginPath: "/portal/student/login" | "/portal/parent/login" | "/portal/teacher/login" | "/portal/pos/login";
};

const PORTAL_HOSTS: PortalHostDescriptor[] = [
  {
    key: "student",
    canonicalPrefix: "students",
    aliases: [],
    portalPath: "/portal/student",
    loginPath: "/portal/student/login",
  },
  {
    key: "parent",
    canonicalPrefix: "parents",
    aliases: ["guardian"],
    portalPath: "/portal/parent",
    loginPath: "/portal/parent/login",
  },
  {
    key: "teacher",
    canonicalPrefix: "staff",
    aliases: [],
    portalPath: "/portal/teacher",
    loginPath: "/portal/teacher/login",
  },
  {
    key: "pos",
    canonicalPrefix: "pos",
    aliases: [],
    portalPath: "/portal/pos",
    loginPath: "/portal/pos/login",
  },
];

function normalizePrefix(prefix: string | null | undefined): string {
  return prefix?.trim().toLowerCase() ?? "";
}

/**
 * How a portal host is spelled under the root.
 *
 * `nested` — `students.acme.<root>` — is today's pattern and the enterprise
 * host's: the portal is a label above the tenant's, and each portal host needs
 * a certificate of its own. `flat` — `students-acme.<root>` — is one label, so
 * a product root's single wildcard certificate covers every portal and
 * standing a tenant up needs no per-host certificate. A host chooses with
 * `PLATFORM_PORTAL_HOSTS=flat`; unset, nothing changes.
 */
export type PortalHostStyle = "nested" | "flat";

export function getPortalHostStyle(): PortalHostStyle {
  return process.env.PLATFORM_PORTAL_HOSTS?.trim().toLowerCase() === "flat" ? "flat" : "nested";
}

/**
 * The portal prefix and tenant slug a flat label carries — `students-acme` is
 * the students' portal of `acme` — or null when the label is a plain tenant's.
 * A slug may itself contain hyphens (`acme-school`), so the split is at the
 * first hyphen, and only when what precedes it is a portal prefix or alias.
 */
export function splitFlatPortalLabel(
  label: string | null | undefined,
): { prefix: string; slug: string; descriptor: PortalHostDescriptor } | null {
  const normalized = normalizePrefix(label);
  const at = normalized.indexOf("-");
  if (at <= 0) return null;
  const prefix = normalized.slice(0, at);
  const slug = normalized.slice(at + 1);
  const descriptor = getPortalHostDescriptorByPrefix(prefix);
  return descriptor && slug ? { prefix, slug, descriptor } : null;
}

export function getPortalHostDescriptors(): PortalHostDescriptor[] {
  return PORTAL_HOSTS;
}

export function getPortalHostDescriptorByKey(key: PortalHostKey): PortalHostDescriptor {
  const descriptor = PORTAL_HOSTS.find((candidate) => candidate.key === key);
  if (!descriptor) throw new Error(`No portal host descriptor for ${key}`);
  return descriptor;
}

export function getPortalHostDescriptorByPrefix(prefix: string | null | undefined): PortalHostDescriptor | null {
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) {
    return null;
  }

  return (
    PORTAL_HOSTS.find(
      (descriptor) =>
        descriptor.canonicalPrefix === normalizedPrefix ||
        descriptor.aliases.includes(normalizedPrefix),
    ) ?? null
  );
}

export function getPortalHostDescriptorByPath(pathname: string | null | undefined): PortalHostDescriptor | null {
  const normalizedPath = pathname?.trim();
  if (!normalizedPath) {
    return null;
  }

  return (
    PORTAL_HOSTS.find(
      (descriptor) =>
        descriptor.portalPath === normalizedPath ||
        descriptor.loginPath === normalizedPath ||
        normalizedPath.startsWith(`${descriptor.portalPath}/`),
    ) ?? null
  );
}

export function isPortalAliasPrefix(prefix: string | null | undefined, descriptor: PortalHostDescriptor): boolean {
  const normalizedPrefix = normalizePrefix(prefix);
  return Boolean(normalizedPrefix) && normalizedPrefix !== descriptor.canonicalPrefix;
}

export function getPortalHostPrefixes(options?: { includeAliases?: boolean }): string[] {
  const includeAliases = options?.includeAliases === true;
  return PORTAL_HOSTS.flatMap((descriptor) =>
    includeAliases
      ? [descriptor.canonicalPrefix, ...descriptor.aliases]
      : [descriptor.canonicalPrefix],
  );
}

export function buildPortalHost(
  prefix: string,
  tenantSlug: string,
  rootDomain: string,
  style: PortalHostStyle = getPortalHostStyle(),
): string {
  const label = normalizePrefix(prefix);
  const slug = tenantSlug.trim().toLowerCase();
  const root = rootDomain.trim().toLowerCase();
  return style === "flat" ? `${label}-${slug}.${root}` : `${label}.${slug}.${root}`;
}

export function getPortalInternalPathForPublicPath(
  pathname: string,
  descriptor: PortalHostDescriptor,
): string {
  if (pathname === "/" || pathname === "") {
    return descriptor.portalPath;
  }

  if (pathname === "/login") {
    return descriptor.loginPath;
  }

  return `${descriptor.portalPath}${pathname}`;
}

export function getPortalPublicPathForInternalPath(
  pathname: string,
  descriptor: PortalHostDescriptor,
): string | null {
  if (pathname === descriptor.portalPath) {
    return "/";
  }

  if (pathname === descriptor.loginPath) {
    return "/login";
  }

  if (pathname.startsWith(`${descriptor.portalPath}/`)) {
    return pathname.slice(descriptor.portalPath.length);
  }

  return null;
}
