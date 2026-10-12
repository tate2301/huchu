import type { SheetKind, SheetRequest, SheetValues } from "@/lib/workspace/sheet-kind";

/**
 * Customers' sheets (60-customers, CUS-02): New customer (W-45). Edit
 * everything (61), Adjust points (64) and Message on WhatsApp (55) join here.
 */

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

type Created = { id: string; code: string; name: string; phone: string; cardNo: string };
type Existing = { id: string; name: string };

const existingOf = (values: SheetValues) => (values._existing as Existing | undefined) ?? null;

const customerNew: SheetKind = {
  title: "New customer",
  sub: "Customers",
  cur: "US$",
  sections: [
    {
      fields: [
        {
          id: "phone",
          t: "text",
          l: "Phone or WhatsApp",
          mono: true,
          p: "+263 7",
          h: "The till finds customers by phone.",
          needed: "That is not a phone number.",
          // A number someone already has: the way to them, under the sentence.
          link: (values) => {
            const existing = existingOf(values);
            return existing ? { label: `Open ${existing.name}`, href: `/retail/customers/${existing.id}` } : null;
          },
        },
        { id: "name", t: "text", l: "Name", needed: "Add their name.", max: 120 },
        {
          id: "msgs",
          t: "toggle",
          l: "Agrees to WhatsApp messages",
          v: true,
          h: "Receipts, points and offers. They can stop any time by replying STOP.",
        },
        {
          id: "dob",
          t: "text",
          l: "Date of birth",
          half: true,
          opt: true,
          p: "Optional",
          h: "For the birthday bonus; also confirms 18+.",
        },
        { id: "area", t: "text", l: "Area", half: true, opt: true, p: "Optional", max: 80 },
      ],
    },
  ],
  note: "They start earning points on their next sale.",
  primary: "Add customer",
  done: (result) => `${(result as Created).name} added. 0 points.`,
  open: (result) => `/retail/customers/${(result as Created).id}`,
  // A 409 names who has the number; the phone field links to them.
  onRefused: (payload) => {
    const existing = (payload as { existing?: Existing } | null)?.existing;
    return existing ? { _existing: existing } : { _existing: undefined };
  },
  submit: (values): SheetRequest => ({
    method: "POST",
    url: "/api/v2/retail/customers",
    body: {
      phone: text(values.phone),
      name: text(values.name),
      marketingConsent: values.msgs === true,
      ...(text(values.dob) ? { dateOfBirth: text(values.dob) } : {}),
      ...(text(values.area) ? { area: text(values.area) } : {}),
      via: "sheet",
    },
  }),
  invalidate: [["list", "retail-customers"], ["lookup", "customer"]],
  requires: [["retail.customers", "create"]],
};

export const CUSTOMER_SHEETS: Record<string, SheetKind> = {
  "customer-new": customerNew,
};
