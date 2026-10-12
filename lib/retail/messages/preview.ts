import { WHATSAPP_COST_PER_MESSAGE } from "@/lib/messaging/whatsapp";
import { startOfDayIn } from "@/lib/reports/list-query";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";
import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";
import { addDays, formatCount, formatMoney, todayIn } from "@/lib/workspace/format";

import {
  OFFER_AUDIENCES,
  offerAudience,
  parseAbout,
  REMINDER_SOURCES,
  reminderAudience,
  topTierName,
  type OfferAudience,
  type ReminderKind,
  type ReminderSource,
} from "./audience";
import { OFFER_PLACEHOLDERS, placeholderWords } from "./render";
import { shopName } from "./send-now";

/**
 * What the Message customers sheet shows before anything is sent (CUS-06):
 * `GET /api/v2/retail/customers/messages/preview`. Who it goes to, how many
 * it reaches, what that costs, the choices under To, the starting text, and
 * the "later" choice under Send (the next Friday 16:00 in the shop's zone).
 */

export class MessageRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 409,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "MessageRefusal";
  }
}

export const NOBODY_TO_MESSAGE = "None of them can be sent a message.";
export const OFFER_HINT = `${placeholderWords(OFFER_PLACEHOLDERS)} fill in for each person.`;

const REMINDER_NOUN: Record<ReminderKind, string> = { layby: "lay-bys", account: "accounts" };

export type MessagePreview = {
  total: number;
  reach: number;
  sub: string;
  note: string;
  primary: string;
  options: Array<{ value: string; label: string }>;
  /** The text the message starts with: empty for an offer, the source's own for a reminder. */
  body: string;
  /** The hint under the message: which placeholders fill in. */
  hint: string;
  later: { at: string; label: string };
};

const SEND_HOUR = 16;

/**
 * The scheduled choice: the next Friday at 16:00 in the shop's zone,
 * "Friday 16:00"; on a Friday before 16:00 it is today's, "Today 16:00".
 */
export function laterSlot(now: Date = new Date(), timeZone = SHOP_TIME_ZONE): { at: string; label: string } {
  const today = todayIn(timeZone, now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const at = (day: string) => new Date(startOfDayIn(day, timeZone).getTime() + SEND_HOUR * 3_600_000);
  let ahead = (5 - weekday + 7) % 7;
  if (ahead === 0 && now.getTime() >= at(today).getTime()) ahead = 7;
  return { at: at(addDays(today, ahead)).toISOString(), label: ahead === 0 ? "Today 16:00" : "Friday 16:00" };
}

const messagesWord = (n: number) => `${formatCount(n)} ${n === 1 ? "message" : "messages"}`;

/** "WhatsApp charges about US$0.02 a message. 8 messages, US$0.16." */
export function costNote(reach: number): string {
  if (reach === 0) return NOBODY_TO_MESSAGE;
  return `WhatsApp charges about ${formatMoney(WHATSAPP_COST_PER_MESSAGE)} a message. ${messagesWord(reach)}, ${formatMoney(reach * WHATSAPP_COST_PER_MESSAGE)}.`;
}

export function isOfferAudience(value: string | null | undefined): value is OfferAudience {
  return (OFFER_AUDIENCES as readonly string[]).includes(value ?? "");
}

/** The reminder source the address names, or a refusal saying why there is none. */
export function reminderSourceFor(about: string | null | undefined): { kind: ReminderKind; ids: string[]; source: ReminderSource } {
  const parsed = parseAbout(about);
  if (!parsed) throw new MessageRefusal("Tick the lay-bys or accounts to remind.", 400);
  const source = REMINDER_SOURCES[parsed.kind];
  if (!source) throw new MessageRefusal(`Reminders for ${REMINDER_NOUN[parsed.kind]} are not set up yet.`, 400);
  return { ...parsed, source };
}

export async function previewMessage(
  companyId: string,
  input: { purpose: "offer" | "reminder"; audience?: string | null; ids?: string[]; about?: string | null; picked?: boolean },
  now: Date = new Date(),
): Promise<MessagePreview> {
  const later = laterSlot(now);

  if (input.purpose === "reminder") {
    const { ids, source } = reminderSourceFor(input.about);
    if (input.audience && input.audience !== "ticked") throw new MessageRefusal("Reminders go to the ones ticked.", 400);
    const { total, reached } = await reminderAudience(companyId, source, ids);
    return {
      total,
      reach: reached.length,
      sub: source.sub(total, reached.length),
      note: costNote(reached.length),
      primary: `Send to ${formatCount(reached.length)}`,
      options: [{ value: "ticked", label: `The ${formatCount(total)} ticked` }],
      body: source.defaultBody(await shopName(companyId)),
      hint: source.hint,
      later,
    };
  }

  const ids = input.ids ?? [];
  const settings = await loadLoyaltySettings(companyId);
  const top = topTierName(settings);
  const tickedWord = input.picked ? "picked" : "ticked";
  const options: Array<{ value: OfferAudience; label: string }> = [];
  if (ids.length) options.push({ value: "ticked", label: `The ${formatCount(ids.length)} ${input.picked ? "you picked" : "ticked"}` });
  if (top) options.push({ value: "top-tier", label: `${top} customers` });
  options.push({ value: "lapsed-30", label: "Not seen in 30 days" }, { value: "all-agreed", label: "Everyone who agreed" });

  const audience = input.audience ?? options[0]!.value;
  if (!isOfferAudience(audience)) throw new MessageRefusal("That is not one of the choices under To.", 400);
  const chosen = options.find((option) => option.value === audience);
  if (!chosen) throw new MessageRefusal("That is not one of the choices under To.", 400);

  const { total, reached } = await offerAudience(companyId, audience, { ids, now, settings });
  const reach = reached.length;
  const agreed = reach === 0 ? "none" : reach === total ? "all" : formatCount(reach);
  const sub =
    audience === "ticked"
      ? `${formatCount(total)} ${tickedWord} · ${agreed} agreed to WhatsApp`
      : audience === "all-agreed"
        ? `${formatCount(reach)} agreed to WhatsApp`
        : `${chosen.label} · ${formatCount(reach)} agreed to WhatsApp`;
  return {
    total,
    reach,
    sub,
    note: costNote(reach),
    primary: `Send to ${formatCount(reach)}`,
    options,
    body: "",
    hint: OFFER_HINT,
    later,
  };
}
