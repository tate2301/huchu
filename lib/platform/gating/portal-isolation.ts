/**
 * Portal Isolation Middleware
 *
 * Enforces that portal users (parents, students, teachers, POS cashiers)
 * can only access their designated portal routes and cannot access
 * the main dashboard or admin routes.
 *
 * Portal Types:
 * - Parent Portal: /portal/parent/*
 * - Student Portal: /portal/student/*
 * - Teacher Portal: /portal/teacher/*
 * - POS Portal: /portal/pos/*
 *
 * Behavior:
 * - Portal users are redirected from main routes to their portal home
 * - Portal context includes entity ID (e.g., parentId, studentId, teacherId)
 * - Data filtering based on portal context
 */

export type PortalRole = "PARENT" | "STUDENT" | "TEACHER" | "HOD" | "POS_CASHIER" | null;

export interface PortalContext {
  role: PortalRole;
  entityId: string; // guardianId, studentId, teacherId, etc.
  entityType: string; // "Guardian", "Student", "Teacher", etc.
  companyId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Route access rules for portal users
 */
const PORTAL_ROUTE_MAP: Record<PortalRole, string[]> = {
  PARENT: ["/portal/parent"],
  STUDENT: ["/portal/student"],
  TEACHER: ["/portal/teacher"],
  HOD: ["/portal/teacher"], // HODs use teacher portal with additional permissions
  POS_CASHIER: ["/portal/pos"],
};

const BLOCKED_ROUTES_FOR_PORTAL_USERS = [
  "/dashboard",
  "/",
  "/schools",
  "/car-sales",
  "/thrift",
  "/accounting",
  "/human-resources",
  "/maintenance",
  "/stores",
  "/gold",
  "/compliance",
  "/cctv",
  "/management",
  "/reports",
];

/**
 * Check if user has portal role
 */
export function isPortalUser(role: PortalRole): boolean {
  return role !== null && role in PORTAL_ROUTE_MAP;
}

/**
 * Get allowed routes for portal role
 */
export function getAllowedRoutesForPortal(role: PortalRole): string[] {
  if (!role || !isPortalUser(role)) {
    return [];
  }
  return PORTAL_ROUTE_MAP[role] || [];
}

/**
 * Get portal home route for role
 */
export function getPortalHomeRoute(role: PortalRole): string | null {
  const allowedRoutes = getAllowedRoutesForPortal(role);
  return allowedRoutes.length > 0 ? allowedRoutes[0] : null;
}

/**
 * Check if route is accessible for portal user
 */
export function isRouteAllowedForPortalUser(
  pathname: string,
  role: PortalRole
): { allowed: boolean; redirectTo?: string } {
  if (!isPortalUser(role)) {
    // Not a portal user, allow access
    return { allowed: true };
  }

  const allowedRoutes = getAllowedRoutesForPortal(role);

  // Check if current path is in allowed routes
  const isAllowed = allowedRoutes.some((route) => pathname.startsWith(route));

  if (isAllowed) {
    return { allowed: true };
  }

  // Check if trying to access blocked route
  const isBlocked = BLOCKED_ROUTES_FOR_PORTAL_USERS.some((route) => pathname === route || pathname.startsWith(route));

  if (isBlocked) {
    const homeRoute = getPortalHomeRoute(role);
    return {
      allowed: false,
      redirectTo: homeRoute || "/login",
    };
  }

  // Allow access to shared routes (help, settings, etc.)
  const sharedRoutes = ["/help", "/settings", "/login", "/logout"];
  if (sharedRoutes.some((route) => pathname.startsWith(route))) {
    return { allowed: true };
  }

  // Default: redirect to portal home
  const homeRoute = getPortalHomeRoute(role);
  return {
    allowed: false,
    redirectTo: homeRoute || "/login",
  };
}

/**
 * Extract portal context from session
 */
export interface UserSession {
  user: {
    id: string;
    email?: string;
    name?: string;
    role?: string;
  };
  portalContext?: PortalContext;
  companyId?: string;
}

export function getPortalContext(session: UserSession | null): PortalContext | null {
  if (!session?.portalContext) {
    return null;
  }
  return session.portalContext;
}

/**
 * Check if user is HOD (Head of Department)
 * HODs have teacher portal access plus additional approval permissions
 */
export function isHOD(context: PortalContext | null): boolean {
  return context?.role === "HOD";
}

/**
 * Get portal navigation items based on role
 */
export interface PortalNavItem {
  href: string;
  label: string;
  icon?: string;
}

export function getPortalNavigation(role: PortalRole): PortalNavItem[] {
  const navigation: Record<PortalRole, PortalNavItem[]> = {
    PARENT: [
      { href: "/portal/parent", label: "Dashboard" },
      { href: "/portal/parent/students", label: "My Children" },
      { href: "/portal/parent/fees", label: "Fee Statements" },
      { href: "/portal/parent/receipts", label: "Payment History" },
      { href: "/portal/parent/notices", label: "Notices" },
    ],
    STUDENT: [
      { href: "/portal/student", label: "Dashboard" },
      { href: "/portal/student/timetable", label: "Timetable" },
      { href: "/portal/student/attendance", label: "Attendance" },
      { href: "/portal/student/results", label: "Results" },
      { href: "/portal/student/fees", label: "Fee Balance" },
    ],
    TEACHER: [
      { href: "/portal/teacher", label: "Dashboard" },
      { href: "/portal/teacher/classes", label: "My Classes" },
      { href: "/portal/teacher/registers", label: "Registers" },
      { href: "/portal/teacher/marks", label: "Marks Entry" },
      { href: "/portal/teacher/moderation", label: "Moderation" },
    ],
    HOD: [
      { href: "/portal/teacher", label: "Dashboard" },
      { href: "/portal/teacher/classes", label: "My Classes" },
      { href: "/portal/teacher/registers", label: "Registers" },
      { href: "/portal/teacher/marks", label: "Marks Entry" },
      { href: "/portal/teacher/moderation", label: "Moderation" },
      { href: "/portal/teacher/approvals", label: "Approvals" },
      { href: "/portal/teacher/reports", label: "Department Reports" },
    ],
    POS_CASHIER: [
      { href: "/portal/pos", label: "POS" },
      { href: "/portal/pos/shift", label: "Shift Management" },
      { href: "/portal/pos/history", label: "Sales History" },
    ],
  };

  return navigation[role as keyof typeof navigation] || [];
}

/**
 * Filter data based on portal context
 * Used in API endpoints to ensure users only see their own data
 */
export function applyPortalDataFilter(
  portalContext: PortalContext | null,
  baseFilter: Record<string, unknown>
): Record<string, unknown> {
  if (!portalContext) {
    return baseFilter;
  }

  const { role, entityId, companyId } = portalContext;

  // Add company filter
  const filter: Record<string, unknown> = {
    ...baseFilter,
    companyId,
  };

  // Add role-specific filters
  switch (role) {
    case "PARENT":
      // Parents can only see data for their linked students
      filter.guardianId = entityId;
      break;

    case "STUDENT":
      // Students can only see their own data
      filter.studentId = entityId;
      break;

    case "TEACHER":
    case "HOD":
      // Teachers can only see data for their assigned classes
      filter.teacherId = entityId;
      break;

    case "POS_CASHIER":
      // Cashiers can only see data for their shifts
      filter.cashierId = entityId;
      break;
  }

  return filter;
}

/**
 * Validate portal context for API requests
 */
export function validatePortalAccess(
  portalContext: PortalContext | null,
  requiredRole: PortalRole | PortalRole[]
): { allowed: boolean; error?: string } {
  if (!portalContext) {
    return { allowed: false, error: "Portal context required" };
  }

  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  if (!roles.includes(portalContext.role)) {
    return {
      allowed: false,
      error: `Access denied. Required role: ${roles.join(" or ")}`,
    };
  }

  return { allowed: true };
}
