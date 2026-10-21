import type { UserRole, WorkspaceProduct } from "@prisma/client";

/**
 * The words Members and a member's page use (design/teams/lexicon.json): one word for each role, product and
 * time. Pure, so the server and the screens say it the same way.
 */

/** What the job is called on a person's row. The owner and admins are named by what they run, not the job. */
const JOB: Partial<Record<UserRole, string>> = {
  MANAGER: "Manager",
  SALES_REP: "Field worker",
  FINANCE_OFFICER: "Bookkeeper",
  SHOP_MANAGER: "Shop manager",
  CASHIER: "Cashier",
  STOCK_CLERK: "Stock clerk",
  SALES_EXEC: "Sales executive",
  CLERK: "Clerk",
  OPERATOR: "Operator",
};

export function jobWord(role: UserRole): string {
  return JOB[role] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ");
}

/** "Owner", "Admin", or the job. */
export function roleWord(member: { role: UserRole; isOwner: boolean; isAdmin: boolean }): string {
  if (member.isOwner) return "Owner";
  if (member.isAdmin || member.role === "SUPERADMIN") return "Admin";
  return jobWord(member.role);
}

/** The jobs an admin can give, by product. Admin and owner are not jobs; only the owner makes an admin. */
export const JOBS: Record<"PABASA" | "TENDER", UserRole[]> = {
  PABASA: ["MANAGER", "SALES_REP", "FINANCE_OFFICER"],
  TENDER: ["SHOP_MANAGER", "CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"],
};

export function jobsFor(product: WorkspaceProduct): UserRole[] {
  return product === "TENDER" ? JOBS.TENDER : JOBS.PABASA;
}

export function productWord(product: WorkspaceProduct): string {
  return product === "TENDER" ? "Tender" : product === "PABASA" ? "Pabasa" : product === "FLARE" ? "Flare" : "Corelith";
}

const HARARE = "Africa/Harare";

function parts(at: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: HARARE, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", year: "numeric", hourCycle: "h23" });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(at)) out[p.type] = p.value;
  return out;
}

/** "10:49". */
export function clock(at: Date): string {
  const p = parts(at);
  return `${p.hour}:${p.minute}`;
}

/** "19 Oct". */
export function dayShort(at: Date): string {
  const p = parts(at);
  return `${p.day} ${p.month}`;
}

/** "Monday 2 November": a day a person can say. */
export function dayLong(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: HARARE, weekday: "long", day: "numeric", month: "long" }).format(at);
}

const sameDay = (a: Date, b: Date) => parts(a).day === parts(b).day && parts(a).month === parts(b).month && parts(a).year === parts(b).year;

/** "10:49" today, "Friday 16 October" for an earlier day. */
export function whenWord(at: Date, now = new Date()): string {
  return sameDay(at, now) ? clock(at) : dayShort(at);
}

/** "11:41" today, "7 Sep" otherwise. */
export const stamp = whenWord;

/** Where a new member of a Pabasa workspace lands: the deals. Other products use their own home. */
export function landingFor(product: WorkspaceProduct): string | null {
  return product === "PABASA" ? "/crm/deals" : null;
}
