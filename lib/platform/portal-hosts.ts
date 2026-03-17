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

export function getPortalHostDescriptors(): PortalHostDescriptor[] {
  return PORTAL_HOSTS;
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

export function buildPortalHost(prefix: string, tenantSlug: string, rootDomain: string): string {
  return `${normalizePrefix(prefix)}.${tenantSlug.trim().toLowerCase()}.${rootDomain.trim().toLowerCase()}`;
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
