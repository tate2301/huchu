import { floatAmount, shiftOpenedSentence } from "@/lib/retail/shift-open-rules";
import type { PickedOption, SheetCtx, SheetKind } from "@/lib/workspace/sheet-kind";

/**
 * The floor's sheets. `shift-open` is the reference sheet (00-foundations
 * 5.7.8, `K.shiftopen`): a manager opening a drawer for a cashier.
 */

type OpenedShift = { id: string; shiftNo: string; registerName: string; cashierName: string };

const shiftOpen: SheetKind = {
  title: "Open a shift",
  sub: "The floor › Shifts",
  cur: "US$",
  sections: [
    {
      fields: [
        { id: "till", t: "auto", l: "Till", noun: "till" },
        {
          id: "who",
          t: "auto",
          l: "Cashier",
          noun: "person",
          context: { sells: true },
          // The signed-in person when they may sell at a till.
          v: (ctx: SheetCtx) => (ctx.can("retail.sell", "open-shift") ? { id: ctx.user.id, label: ctx.user.name } : null),
          // Someone who may only open their own sees themselves, fixed.
          fixed: (ctx) =>
            ctx.can("retail.cash-control", "update")
              ? null
              : { value: { id: ctx.user.id, label: ctx.user.name }, shown: ctx.user.name },
        },
        {
          id: "float",
          t: "money",
          l: "Opening float",
          half: true,
          // No close records the float it left yet (the floor spec adds it), so
          // the hint says only what the field is.
          h: "Counted in.",
          schema: floatAmount,
        },
      ],
    },
  ],
  note: "Cashiers usually open from the till with their PIN. This is for when a manager opens it for them.",
  primary: "Open it",
  done: (result) => shiftOpenedSentence(result as OpenedShift),
  open: (result) => `/retail/shifts/${(result as OpenedShift).id}`,
  submit: (values) => ({
    method: "POST",
    url: "/api/v2/retail/shifts",
    body: {
      registerId: (values.till as PickedOption).id,
      cashierId: (values.who as PickedOption).id,
      openingFloat: String(values.float).trim(),
    },
  }),
  invalidate: [["list", "retail-shifts"], ["retail-current-shift"], ["nav-badges"], ["lookup", "till"]],
  requires: [["retail.sell", "open-shift"]],
};

export const FLOOR_SHEETS: Record<string, SheetKind> = {
  "shift-open": shiftOpen,
};
