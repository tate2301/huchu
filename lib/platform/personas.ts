export type PersonaDomain = "schools" | "retail" | "portal";

export type PersonaCode =
  | "SCHOOL_ADMIN"
  | "REGISTRAR"
  | "BURSAR"
  | "HOD"
  | "TEACHER"
  | "WARDEN"
  | "PARENT"
  | "STUDENT"
  | "CASHIER"
  | "STOCK_CLERK"
  | "RETAIL_MANAGER";

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
  { code: "CASHIER", domain: "retail", label: "Cashier", description: "POS selling, shift open/close, and tender capture." },
  { code: "STOCK_CLERK", domain: "retail", label: "Stock Clerk", description: "Catalog upkeep, receiving coordination, and stock movement support." },
  { code: "RETAIL_MANAGER", domain: "retail", label: "Retail Manager", description: "Pricing, promotions, cash-up approvals, and retail governance." },
];

/** Everything a school resource can be asked to do. */
const SCHOOL_FULL_ACTIONS: string[] = [
  "view",
  "create",
  "edit",
  "archive",
  "approve",
  "invite",
  "capture",
  "submit",
  "moderate",
  "request-changes",
  "publish",
  "unpublish",
  "issue",
  "receive-payment",
  "waive",
  "write-off",
  "void",
  "refund",
  "allocate-bed",
  "approve-leave",
  "check-in",
  "check-out",
  /**
   * S-4.4 — changing what the system asks about every record of a type: adding
   * a custom field to a pupil or a parent, and later the rest of the school's
   * own configuration.
   *
   * Only on this list, so it stays with the administrator. A registrar creates
   * students all day and should not be able to change what a student *is* — the
   * fields outlive whoever added them and every record carries them.
   */
  "configure",
  /**
   * Writing to a family — a notice, a fee reminder, an absence chase. Separate
   * from `create` because the routes that send them were guarded on
   * `schools.reports:create`, a grant only the head holds, so the bursar was
   * sold an arrears list she could not act on and a teacher's own "tell the
   * family" button answered 403.
   */
  "notify-families",
  /**
   * Answering a thread a family started in the office inbox. Also stranded on
   * `schools.reports:create`, which meant the bursar could read a fee question
   * and the HOD a results query, and neither could reply.
   */
  "reply",
  /**
   * Opening a parents' evening slot. It was guarded on `schools.students:edit`,
   * so a teacher booking a meeting needed the registrar's power to rewrite the
   * pupil record. Booking a conversation is not editing a pupil.
   */
  "book-meeting",
  /**
   * Closing a register against further change. `lock` rode on
   * `attendance:submit`, which teachers hold, so a teacher could seal their own
   * register — the one act the lock exists to let the office perform over them.
   */
  "lock",
  // Conduct: record a merit or a demerit. Separate from `create`, so a teacher
  // can award a point without being able to log an incident.
  "award",
  // Conduct: stamp that home was told.
  "tell-home",
  // Detention: mark a register.
  "mark",
  // Exams: enter a candidate, and build the entry file a human uploads.
  "enter",
  // Leavers: settle a clearance mark.
  "clear",
  // Leavers and alumni: record a destination, issue a document.
  "record",
];

const PERMISSIONS_BY_PERSONA: Record<PersonaCode, PersonaPermission[]> = {
  // The school grants were written as a sketch — SCHOOL_ADMIN carried no
  // `schools.fees` at all despite being described as full administration, so
  // enforcing them as they stood would have locked the head out of the fee
  // ledger. They are now complete, and each persona's spread follows the
  // description it already carried in PERSONAS above.
  SCHOOL_ADMIN: [
    { resource: "schools.academics", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.admissions", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.students", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.teachers", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.attendance", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.fees", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.boarding", actions: SCHOOL_FULL_ACTIONS },
    // Health records, consents and sanatorium events are their own resource
    // rather than part of `schools.boarding`. Gating them as boarding meant a
    // day school — which has no boarding — had no welfare screen at all, and
    // the registrar, HOD and class teacher who need a pupil's allergy or
    // consent flag in front of them could not read one.
    { resource: "schools.welfare", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.results", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.reports", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.conduct", actions: SCHOOL_FULL_ACTIONS },
    // Not `SCHOOL_FULL_ACTIONS`, and not because the head is untrusted. A band
    // grant answers "may this role read pastoral notes at all"; which notes,
    // about which pupils, is `SchoolPastoralClearance` and the named readers on
    // the note itself. The head reads what the head is cleared for.
    { resource: "schools.pastoral", actions: ["view", "create", "edit", "archive"] },
    { resource: "schools.exams", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.leavers", actions: SCHOOL_FULL_ACTIONS },
    { resource: "schools.alumni", actions: SCHOOL_FULL_ACTIONS },
  ],
  REGISTRAR: [
    { resource: "schools.academics", actions: ["view", "create", "edit"] },
    { resource: "schools.admissions", actions: ["view", "create", "edit", "approve"] },
    { resource: "schools.students", actions: ["view", "create", "edit", "archive", "invite"] },
    { resource: "schools.teachers", actions: ["view", "create", "edit"] },
    { resource: "schools.attendance", actions: ["view", "lock"] },
    { resource: "schools.fees", actions: ["view"] },
    { resource: "schools.boarding", actions: ["view"] },
    { resource: "schools.welfare", actions: ["view", "create", "edit"] },
    { resource: "schools.results", actions: ["view"] },
    { resource: "schools.reports", actions: ["view", "notify-families", "reply"] },
    { resource: "schools.conduct", actions: ["view", "create", "edit", "tell-home", "award"] },
    // The registrar keeps the roll, so the exam entry file and the leaving
    // queue are hers. Results capture is the exams officer's.
    { resource: "schools.exams", actions: ["view", "create", "edit", "enter"] },
    { resource: "schools.leavers", actions: ["view", "create", "edit", "clear", "record"] },
    { resource: "schools.alumni", actions: ["view", "create", "edit", "record"] },
  ],
  BURSAR: [
    { resource: "schools.academics", actions: ["view"] },
    { resource: "schools.admissions", actions: ["view"] },
    { resource: "schools.students", actions: ["view", "invite"] },
    {
      resource: "schools.fees",
      actions: [
        "view",
        "create",
        "edit",
        "issue",
        "receive-payment",
        "waive",
        "write-off",
        "void",
        "refund",
      ],
    },
    { resource: "schools.welfare", actions: ["view"] },
    { resource: "schools.reports", actions: ["view", "notify-families", "reply"] },
    // The entry fee is a fee: the bursar invoices it and receives it. She does
    // not decide who is entered.
    { resource: "schools.exams", actions: ["view", "issue"] },
    // One of the five leaving marks is hers, which is the whole of her interest
    // in the queue.
    { resource: "schools.leavers", actions: ["view", "clear"] },
  ],
  HOD: [
    { resource: "schools.academics", actions: ["view"] },
    { resource: "schools.students", actions: ["view"] },
    { resource: "schools.teachers", actions: ["view"] },
    { resource: "schools.attendance", actions: ["view"] },
    {
      resource: "schools.results",
      actions: ["view", "moderate", "request-changes", "approve"],
    },
    { resource: "schools.welfare", actions: ["view"] },
    { resource: "schools.reports", actions: ["view", "notify-families", "reply"] },
    { resource: "schools.conduct", actions: ["view", "create", "award", "mark"] },
    { resource: "schools.exams", actions: ["view", "capture"] },
  ],
  TEACHER: [
    { resource: "schools.academics", actions: ["view"] },
    { resource: "schools.students", actions: ["view", "book-meeting"] },
    // No `lock`: the office locks a register, and a teacher who could lock
    // their own would be signing off their own work.
    { resource: "schools.attendance", actions: ["view", "capture", "submit"] },
    { resource: "schools.welfare", actions: ["view"] },
    { resource: "schools.results", actions: ["view", "capture", "submit"] },
    { resource: "schools.reports", actions: ["view", "notify-families"] },
    // A teacher logs what happened in her lesson, awards the point, and marks
    // the register she is supervising. She does not decide the sanction, and
    // she does not tell home — a parent hears from the office, once.
    { resource: "schools.conduct", actions: ["view", "create", "award", "mark"] },
  ],
  WARDEN: [
    { resource: "schools.students", actions: ["view"] },
    { resource: "schools.attendance", actions: ["view"] },
    {
      resource: "schools.boarding",
      actions: [
        "view",
        "create",
        "edit",
        "allocate-bed",
        "approve-leave",
        "check-in",
        "check-out",
      ],
    },
    { resource: "schools.welfare", actions: ["view", "create", "edit", "archive"] },
    { resource: "schools.reports", actions: ["view"] },
    { resource: "schools.conduct", actions: ["view", "award", "mark"] },
    // The closest thing this product has to a school nurse is a warden — the
    // reason is in `app/api/v2/schools/health/route.ts`, verbatim: the persona
    // that should read medical information about children is the one
    // responsible for their welfare. `Pastoral` draws Sister Moyo, School
    // Nurse, cleared for two of the three bands; there is no nurse persona to
    // grant that to, so the warden carries it and the clearance table decides
    // which notes she actually sees.
    { resource: "schools.pastoral", actions: ["view", "create", "edit"] },
    // The bed is one of the five leaving marks.
    { resource: "schools.leavers", actions: ["view", "clear"] },
  ],
  PARENT: [
    { resource: "schools.portal.parent", actions: ["view-linked-students", "view-fees", "view-results"] },
  ],
  STUDENT: [
    { resource: "schools.portal.student", actions: ["view-own-profile", "view-own-attendance", "view-own-results"] },
  ],
  CASHIER: [
    { resource: "retail.pos", actions: ["view", "sell", "close-shift"] },
    { resource: "retail.refunds", actions: ["request"] },
  ],
  STOCK_CLERK: [
    { resource: "retail.purchasing", actions: ["view", "create", "receive"] },
    { resource: "retail.catalog", actions: ["view", "edit"] },
  ],
  RETAIL_MANAGER: [
    { resource: "retail.pos", actions: ["view", "sell", "override"] },
    { resource: "retail.shifts", actions: ["view", "run", "approve"] },
    { resource: "retail.promotions", actions: ["view", "edit", "apply"] },
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


/**
 * The persona a signed-in user acts as.
 *
 * The persona catalogue has always described what each role may do, but nothing
 * mapped a `UserRole` onto a `PersonaCode`, so `hasPersonaPermission` had zero
 * call sites and the grants were decoration. This is that map.
 *
 * `SUPERADMIN` and `MANAGER` return null deliberately: they are the tenant's
 * own administrators and are not constrained by a vertical persona. Callers
 * check for them before asking here.
 *
 * `AUTO_MANAGER` and `SALES_EXEC` are absent since ST-1.1 dropped car sales.
 * They map to nothing, so `personaForRole` returns null and the persona checks
 * deny — which is the right answer for both: the deals and leads they described
 * no longer exist, and a `SALES_EXEC` kept on for CRM has no persona grants to
 * spend anywhere else.
 */
const ROLE_TO_PERSONA: Record<string, PersonaCode> = {
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  REGISTRAR: "REGISTRAR",
  BURSAR: "BURSAR",
  HOD: "HOD",
  WARDEN: "WARDEN",
  TEACHER: "TEACHER",
  PARENT: "PARENT",
  STUDENT: "STUDENT",
  SHOP_MANAGER: "RETAIL_MANAGER",
  CASHIER: "CASHIER",
  STOCK_CLERK: "STOCK_CLERK",
};

export function personaForRole(role?: string | null): PersonaCode | null {
  if (!role) return null;
  return ROLE_TO_PERSONA[role.trim().toUpperCase()] ?? null;
}
