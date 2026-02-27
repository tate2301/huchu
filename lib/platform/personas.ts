export type PersonaDomain = "schools" | "autos" | "thrift" | "portal";

export type PersonaCode =
  | "SCHOOL_ADMIN"
  | "REGISTRAR"
  | "BURSAR"
  | "HOD"
  | "TEACHER"
  | "WARDEN"
  | "PARENT"
  | "STUDENT"
  | "SALES_MANAGER"
  | "SALES_EXEC"
  | "LOT_MANAGER"
  | "CASHIER"
  | "STOCK_CLERK"
  | "THRIFT_MANAGER";

export interface PersonaDefinition {
  code: PersonaCode;
  domain: PersonaDomain;
  label: string;
  description: string;
}

export interface PersonaPermission {
  resource: string;
  actions: string[];
}

export const PERSONAS: PersonaDefinition[] = [
  { code: "SCHOOL_ADMIN", domain: "schools", label: "School Admin", description: "Full schools pack administration." },
  { code: "REGISTRAR", domain: "schools", label: "Registrar", description: "Admissions, students, and records lifecycle." },
  { code: "BURSAR", domain: "schools", label: "Bursar", description: "Fees, receipts, and school finance operations." },
  { code: "HOD", domain: "schools", label: "Head Of Department", description: "Results moderation and academic approvals." },
  { code: "TEACHER", domain: "schools", label: "Teacher", description: "Class attendance, marks entry, and result submissions." },
  { code: "WARDEN", domain: "schools", label: "Warden", description: "Boarding operations, bed allocations, and leave workflows." },
  { code: "PARENT", domain: "portal", label: "Parent", description: "Portal access for linked child records and fees." },
  { code: "STUDENT", domain: "portal", label: "Student", description: "Portal access for own timetable, attendance, and results." },
  { code: "SALES_MANAGER", domain: "autos", label: "Sales Manager", description: "Car sales deals, approvals, and pipeline oversight." },
  { code: "SALES_EXEC", domain: "autos", label: "Sales Executive", description: "Lead handling and deal progression." },
  { code: "LOT_MANAGER", domain: "autos", label: "Lot Manager", description: "Vehicle inventory and lot control." },
  { code: "CASHIER", domain: "thrift", label: "Cashier", description: "POS selling, shift open/close, and tender capture." },
  { code: "STOCK_CLERK", domain: "thrift", label: "Stock Clerk", description: "Item intake, catalog upkeep, and stock movements." },
  { code: "THRIFT_MANAGER", domain: "thrift", label: "Thrift Manager", description: "Markdown rules, settlements, and thrift governance." },
];

const PERMISSIONS_BY_PERSONA: Record<PersonaCode, PersonaPermission[]> = {
  SCHOOL_ADMIN: [
    { resource: "schools.students", actions: ["view", "create", "edit", "archive"] },
    { resource: "schools.boarding", actions: ["view", "create", "edit", "approve"] },
    { resource: "schools.results", actions: ["view", "publish", "unpublish"] },
  ],
  REGISTRAR: [
    { resource: "schools.admissions", actions: ["view", "create", "edit", "approve"] },
    { resource: "schools.students", actions: ["view", "create", "edit"] },
  ],
  BURSAR: [
    { resource: "schools.fees", actions: ["view", "create", "issue", "receive-payment"] },
  ],
  HOD: [
    { resource: "schools.results", actions: ["view", "moderate", "request-changes"] },
  ],
  TEACHER: [
    { resource: "schools.attendance", actions: ["view", "capture", "submit"] },
    { resource: "schools.results", actions: ["view", "capture", "submit"] },
  ],
  WARDEN: [
    { resource: "schools.boarding", actions: ["view", "allocate-bed", "approve-leave", "check-in", "check-out"] },
  ],
  PARENT: [
    { resource: "schools.portal.parent", actions: ["view-linked-students", "view-fees", "view-results"] },
  ],
  STUDENT: [
    { resource: "schools.portal.student", actions: ["view-own-profile", "view-own-attendance", "view-own-results"] },
  ],
  SALES_MANAGER: [
    { resource: "autos.deals", actions: ["view", "create", "edit", "approve"] },
    { resource: "autos.leads", actions: ["view", "assign", "convert"] },
  ],
  SALES_EXEC: [
    { resource: "autos.leads", actions: ["view", "create", "edit", "convert"] },
    { resource: "autos.deals", actions: ["view", "create", "edit"] },
  ],
  LOT_MANAGER: [
    { resource: "autos.inventory", actions: ["view", "create", "edit", "transfer"] },
  ],
  CASHIER: [
    { resource: "thrift.checkout", actions: ["view", "sell", "close-shift"] },
    { resource: "thrift.reversals", actions: ["request"] },
  ],
  STOCK_CLERK: [
    { resource: "thrift.intake", actions: ["view", "create", "grade"] },
    { resource: "thrift.catalog", actions: ["view", "edit"] },
  ],
  THRIFT_MANAGER: [
    { resource: "thrift.checkout", actions: ["view", "sell", "override"] },
    { resource: "thrift.settlement", actions: ["view", "run", "approve"] },
    { resource: "thrift.markdown", actions: ["view", "edit", "apply"] },
  ],
};

export function getPersonaDefinitions(): PersonaDefinition[] {
  return PERSONAS;
}

export function getPersonaPermissions(persona: PersonaCode): PersonaPermission[] {
  return PERMISSIONS_BY_PERSONA[persona] ?? [];
}

export function hasPersonaPermission(
  personas: PersonaCode[] | undefined,
  resource: string,
  action: string,
): boolean {
  if (!personas || personas.length === 0) return false;
  return personas.some((persona) =>
    getPersonaPermissions(persona).some(
      (permission) =>
        permission.resource === resource && permission.actions.includes(action),
    ),
  );
}
