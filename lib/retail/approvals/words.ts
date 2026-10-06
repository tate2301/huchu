import { formatLimitMoney } from "@/lib/retail/roles-matrix";

/**
 * Approvals and limits in the page's words (80-admin 4.2, 5.7). Browser-safe:
 * the settings page, its store and the waiting list share them.
 */

/** The React Query key of "Waiting now"; an approval anywhere invalidates it. */
export const WAITING_QUERY_KEY = ["retail-approvals-waiting"] as const;

export type PriceChangeRule = "MANAGERS" | "OWNER";
export type CountApprovalRule = "ANY_MANAGER" | "OWNER_OVER_LIMIT";
export type ApprovalChannel = "APP" | "WHATSAPP_AND_APP";

export const PRICE_CHANGE_WORDS: Record<PriceChangeRule, string> = {
  MANAGERS: "Managers, no approval",
  OWNER: "Owner approves",
};

export const ASK_BY_WORDS: Record<ApprovalChannel, string> = {
  APP: "The app only",
  WHATSAPP_AND_APP: "WhatsApp and the app",
};

/** "Any manager" · "Owner approves over US$100": the second segment carries the stored amount. */
export function countDifferencesWords(countOwnerOver: string | number): Record<CountApprovalRule, string> {
  return {
    ANY_MANAGER: "Any manager",
    OWNER_OVER_LIMIT: `Owner approves over ${formatLimitMoney(countOwnerOver)}`,
  };
}

/** The rule a label names, or null. */
export function ruleOf<T extends string>(words: Record<T, string>, label: unknown): T | null {
  const entry = (Object.entries(words) as Array<[T, string]>).find(([, word]) => word === label);
  return entry ? entry[0] : null;
}

/** How long something has waited: "20 minutes", "1 hour", "3 hours", "1 day", "4 days". */
export function waitedWords(since: Date | string, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.floor((now.getTime() - new Date(since).getTime()) / 60_000));
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}
