import type { Block, TemplateKind } from "@/lib/crm/blocks";
import type { FieldChoice } from "@/lib/forms/fields";

/** A pick question's choices, stored as the words shown. */
function choices(...labels: string[]): FieldChoice[] {
  return labels.map((label) => ({ value: label, label }));
}

/**
 * Somewhere to start.
 *
 * A new template used to open as a heading and, for a form, one question
 * asking for a name. That is not a starting point, it is an empty room with a
 * light on: whoever opened it now has to know what an invoice needs on it,
 * remember the tax line, decide where the terms go, and do that before they
 * get to the thing they actually came to write.
 *
 * These are the documents a small contractor sends. They are complete enough
 * to use unedited on the first day and obvious enough to edit on the second —
 * every one is real blocks, so nothing here is a preview of something that
 * has to be built again later.
 *
 * Wording is deliberately plain. A starter that opens with three paragraphs
 * of legalese gets deleted; a starter that opens with a sentence somebody
 * would actually say gets kept and adjusted.
 */

export type StarterTemplate = {
  id: string;
  kind: TemplateKind;
  name: string;
  emoji: string;
  /** What this is for, in the words somebody would use asking for it. */
  description: string;
  blocks: Block[];
};

/** Branding then title: every document this company sends looks like itself. */
function letterhead(titleText: string): Block[] {
  return [
    { id: "logo", type: "image", source: "branding.logo", alt: "{{company.name}}", width: 160 },
    { id: "title", type: "heading", text: titleText, level: 1 },
  ];
}

const PAYMENT_TERMS =
  "Payment is due within 14 days of the invoice date. Please quote the invoice number on the transfer so we can match it against your account. If anything on this invoice looks wrong, tell us before paying it — sorting it out afterwards takes longer for both of us.";

const QUOTE_TERMS =
  "This quotation is valid until {{document.validUntil}}. Prices assume the site is accessible during normal working hours and that the conditions are as we found them. If we uncover something that changes the work, we will stop and tell you what it costs before carrying on — you will not be billed for anything you have not agreed to.";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // --- what somebody fills in ------------------------------------------
  {
    id: "site-brief",
    kind: "FORM",
    name: "Site brief",
    emoji: "📍",
    description:
      "What the person going out needs to know, and what they should bring back. Fill it in before the visit, finish it on site.",
    blocks: [
      ...letterhead("Site brief"),
      {
        id: "intro",
        type: "text",
        text: "For {{customer.name}} — {{record.title}}. Fill in what you can before you leave; the rest is for on site.",
      },
      { id: "d1", type: "divider" },
      { id: "h-where", type: "heading", text: "Where and when", level: 2 },
      {
        id: "cols-where",
        type: "columns",
        left: [
          {
            id: "f-address",
            type: "field",
            field: {
              key: "address",
              label: "Site address",
              type: "text",
              required: true,
              help: "The address a driver can follow, not the billing address.",
              prefill: "customer.address",
            },
          },
          {
            id: "f-access",
            type: "field",
            field: {
              key: "access",
              label: "How do we get in?",
              type: "longText",
              required: false,
              placeholder: "Gate code, who to ask for, where to park",
            },
          },
        ],
        right: [
          {
            id: "f-date",
            type: "field",
            field: {
              key: "visit_date",
              label: "Date of visit",
              type: "date",
              required: true,
            },
          },
          {
            id: "f-contact",
            type: "field",
            field: {
              key: "site_contact",
              label: "Who is meeting us",
              type: "text",
              required: false,
              prefill: "contact.name",
            },
          },
          {
            id: "f-phone",
            type: "field",
            field: {
              key: "site_contact_phone",
              label: "Their phone",
              type: "phone",
              required: false,
              prefill: "contact.phone",
            },
          },
        ],
      },
      { id: "d2", type: "divider" },
      { id: "h-work", type: "heading", text: "What we are there for", level: 2 },
      {
        id: "f-scope",
        type: "field",
        field: {
          key: "scope",
          label: "What the customer has asked for",
          type: "longText",
          required: true,
          placeholder: "In their words, not ours",
        },
      },
      {
        id: "f-measure",
        type: "field",
        field: {
          key: "measurements",
          label: "Measurements taken",
          type: "longText",
          required: false,
          help: "Anything the quote will be priced off. Say what you measured, not just the number.",
        },
      },
      {
        id: "f-condition",
        type: "field",
        field: {
          key: "condition",
          label: "Condition on arrival",
          type: "select",
          required: false,
          options: choices("Good", "Fair", "Poor", "Unsafe — stopped work"),
        },
      },
      {
        id: "f-risks",
        type: "field",
        field: {
          key: "risks",
          label: "Anything that will slow the job down",
          type: "longText",
          required: false,
          placeholder: "Height, live power, occupied rooms, animals, no water",
        },
      },
      {
        id: "f-photos",
        type: "field",
        field: {
          key: "photos",
          label: "Photos",
          type: "file",
          required: false,
          help: "Wide shot first, then the detail. A photo now saves an argument later.",
        },
      },
      { id: "d3", type: "divider" },
      {
        id: "f-next",
        type: "field",
        field: {
          key: "next_step",
          label: "What happens next",
          type: "select",
          required: true,
          options: choices("Quote it", "Needs a second visit", "Refer out — not our work", "Customer is not proceeding"),
        },
      },
      {
        id: "sign",
        type: "signature",
        label: "Attended by",
        party: "us",
      },
    ],
  },
  {
    id: "enquiry",
    kind: "FORM",
    name: "New enquiry",
    emoji: "📥",
    description:
      "A public form that turns a stranger into a lead. Short on purpose — every extra question loses somebody.",
    blocks: [
      ...letterhead("Tell us about the job"),
      {
        id: "intro",
        type: "text",
        text: "Fill this in and we will come back to you. It takes about a minute.",
      },
      {
        id: "cols-who",
        type: "columns",
        left: [
          {
            id: "f-name",
            type: "field",
            field: {
              key: "name",
              label: "Your name",
              type: "text",
              required: true,
            },
          },
          {
            id: "f-phone",
            type: "field",
            field: {
              key: "phone",
              label: "Phone",
              type: "phone",
              required: true,
              help: "The fastest way to get an answer.",
            },
          },
        ],
        right: [
          {
            id: "f-email",
            type: "field",
            field: {
              key: "email",
              label: "Email",
              type: "email",
              required: false,
            },
          },
          {
            id: "f-company",
            type: "field",
            field: {
              key: "company",
              label: "Company",
              type: "text",
              required: false,
              placeholder: "Leave blank if this is for your home",
            },
          },
        ],
      },
      {
        id: "f-what",
        type: "field",
        field: {
          key: "description",
          label: "What needs doing?",
          type: "longText",
          required: true,
          placeholder: "A sentence is plenty — we will call to get the detail.",
        },
      },
      {
        id: "f-where",
        type: "field",
        field: {
          key: "address",
          label: "Where is it?",
          type: "text",
          required: false,
        },
      },
      {
        id: "f-when",
        type: "field",
        field: {
          key: "urgency",
          label: "How soon?",
          type: "select",
          required: false,
          options: choices("It is an emergency", "This week", "This month", "Just getting prices"),
        },
      },
      {
        id: "f-photos",
        type: "field",
        field: {
          key: "photos",
          label: "Photos, if you have any",
          type: "file",
          required: false,
          help: "A photo usually saves a visit.",
        },
      },
    ],
  },
  {
    id: "handover",
    kind: "FORM",
    name: "Job handover",
    emoji: "✅",
    description:
      "Signed off at the end of a job, on site, by whoever is standing there. What was done, what was left, and their name on it.",
    blocks: [
      ...letterhead("Job handover"),
      {
        id: "intro",
        type: "text",
        text: "{{record.title}} for {{customer.name}}, completed {{date.today}}.",
      },
      { id: "d1", type: "divider" },
      {
        id: "f-done",
        type: "field",
        field: {
          key: "work_done",
          label: "What was done",
          type: "longText",
          required: true,
        },
      },
      {
        id: "f-outstanding",
        type: "field",
        field: {
          key: "outstanding",
          label: "Anything left outstanding",
          type: "longText",
          required: false,
          help: "Say it here rather than hoping nobody notices. A known gap is a follow-up; a hidden one is a complaint.",
        },
      },
      {
        id: "f-tidied",
        type: "field",
        field: {
          key: "site_clear",
          label: "Site left clear and safe",
          type: "checkbox",
          required: false,
        },
      },
      {
        id: "f-rating",
        type: "field",
        field: {
          key: "rating",
          label: "How did we do?",
          type: "rating",
          required: false,
        },
      },
      {
        id: "f-comments",
        type: "field",
        field: {
          key: "comments",
          label: "Anything you want to tell us",
          type: "longText",
          required: false,
        },
      },
      { id: "d2", type: "divider" },
      {
        id: "terms",
        type: "terms",
        text: "Signing confirms the work described above was carried out. It is not agreement to a price — anything about the invoice is a separate conversation and nothing here changes it.",
      },
      { id: "sign", type: "signature", label: "Signed on site", party: "both" },
    ],
  },

  // --- what a customer is sent -----------------------------------------
  {
    id: "quotation",
    kind: "QUOTE",
    name: "Quotation",
    emoji: "📄",
    description:
      "Priced work, with what is included spelled out and what happens if the job changes.",
    blocks: [
      ...letterhead("Quotation {{document.number}}"),
      {
        id: "cols-parties",
        type: "columns",
        left: [
          { id: "h-to", type: "heading", text: "For", level: 3 },
          {
            id: "t-to",
            type: "text",
            text: "{{customer.name}}\n{{contact.name}}\n{{customer.address}}\n{{contact.email}}",
          },
        ],
        right: [
          { id: "h-from", type: "heading", text: "From", level: 3 },
          {
            id: "t-from",
            type: "text",
            text: "{{company.name}}\n{{company.address}}\n{{company.phone}}\nTax number {{company.taxNumber}}",
          },
        ],
      },
      { id: "d1", type: "divider" },
      { id: "h-job", type: "heading", text: "{{record.title}}", level: 2 },
      {
        id: "t-summary",
        type: "text",
        text: "Prepared {{date.today}} by {{user.name}}. Valid until {{document.validUntil}}.",
      },
      { id: "items", type: "lineItems", showTax: true, showDiscount: true },
      { id: "totals", type: "totals", showTax: true, showPaid: false },
      { id: "sp", type: "spacer", size: "md" },
      { id: "h-terms", type: "heading", text: "What this covers", level: 3 },
      { id: "terms", type: "terms", text: QUOTE_TERMS },
      { id: "sign", type: "signature", label: "Accepted by", party: "customer" },
    ],
  },
  {
    id: "invoice",
    kind: "INVOICE",
    name: "Invoice",
    emoji: "🧾",
    description:
      "What is owed, when it is due, and how to pay it — with the reference somebody needs to quote on the transfer.",
    blocks: [
      ...letterhead("Invoice {{document.number}}"),
      {
        id: "cols-parties",
        type: "columns",
        left: [
          { id: "h-to", type: "heading", text: "Bill to", level: 3 },
          {
            id: "t-to",
            type: "text",
            text: "{{customer.name}}\n{{customer.address}}\n{{customer.email}}\nAccount {{customer.reference}}",
          },
        ],
        right: [
          { id: "h-from", type: "heading", text: "From", level: 3 },
          {
            id: "t-from",
            type: "text",
            text: "{{company.name}}\n{{company.address}}\n{{company.phone}}\nTax number {{company.taxNumber}}",
          },
        ],
      },
      { id: "d1", type: "divider" },
      { id: "h-job", type: "heading", text: "{{record.title}}", level: 2 },
      { id: "t-dated", type: "text", text: "Invoiced {{date.today}}." },
      { id: "items", type: "lineItems", showTax: true, showDiscount: false },
      // Paid shown even at zero: the balance is the number the reader came
      // for, and a deposit already taken must be visible or they pay twice.
      { id: "totals", type: "totals", showTax: true, showPaid: true },
      { id: "sp", type: "spacer", size: "md" },
      { id: "h-pay", type: "heading", text: "How to pay", level: 3 },
      {
        id: "t-pay",
        type: "text",
        text: "Balance owing: {{document.balance}} {{document.currency}}. Please quote {{document.number}} on the payment.",
      },
      { id: "terms", type: "terms", text: PAYMENT_TERMS },
    ],
  },
  {
    id: "receipt",
    kind: "RECEIPT",
    name: "Receipt",
    emoji: "💵",
    description:
      "Proof a payment was taken, and what is still outstanding after it. One page, no ambiguity.",
    blocks: [
      ...letterhead("Receipt {{document.number}}"),
      {
        id: "t-intro",
        type: "text",
        text: "Received from {{customer.name}} on {{date.today}}, with thanks.",
      },
      { id: "d1", type: "divider" },
      { id: "h-what", type: "heading", text: "{{record.title}}", level: 2 },
      {
        id: "t-amount",
        type: "text",
        text: "Amount received: {{document.total}} {{document.currency}}.",
      },
      // Balance on the receipt, not only on the invoice: a receipt that shows
      // only what was paid is how a part-payment gets remembered as the whole
      // thing.
      {
        id: "t-balance",
        type: "text",
        text: "Balance still owing after this payment: {{document.balance}} {{document.currency}}.",
      },
      { id: "totals", type: "totals", showTax: true, showPaid: true },
      { id: "sp", type: "spacer", size: "md" },
      {
        id: "terms",
        type: "terms",
        text: "Keep this receipt. If the balance above does not match your records, contact us on {{company.phone}} before the next payment falls due.",
      },
    ],
  },

  // --- what gets sent about a record ------------------------------------
  {
    id: "quote-follow-up",
    kind: "EMAIL",
    name: "Quote follow-up",
    emoji: "✉️",
    description:
      "The chase that does not read like a chase. Sent a few days after a quote goes out.",
    blocks: [
      { id: "h", type: "heading", text: "Following up on {{document.number}}", level: 2 },
      {
        id: "body",
        type: "text",
        text: "Hi {{contact.firstName}},\n\nJust checking you got the quote for {{record.title}} — {{document.total}}, valid until {{document.validUntil}}.\n\nNo rush, and no pressure. If anything in it needs changing, or if the timing is wrong, tell me and I will adjust it rather than send it again unchanged.\n\n{{user.name}}\n{{company.name}} · {{company.phone}}",
      },
    ],
  },
];

export function starterTemplate(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((starter) => starter.id === id);
}

export function startersForKind(kind: TemplateKind): StarterTemplate[] {
  return STARTER_TEMPLATES.filter((starter) => starter.kind === kind);
}

/**
 * The starter, with its title changed to what somebody named it.
 *
 * A template called "Roof survey" whose first heading still says "Site brief"
 * is the sort of thing that reaches a customer, because the person who named
 * it never scrolled back up.
 */
export function starterBlocks(starter: StarterTemplate, name: string): Block[] {
  const trimmed = name.trim();
  if (!trimmed) return starter.blocks;

  return starter.blocks.map((block) =>
    block.type === "heading" && block.level === 1 && block.id === "title"
      ? { ...block, text: trimmed }
      : block,
  );
}
