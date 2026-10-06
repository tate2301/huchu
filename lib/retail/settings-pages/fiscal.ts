import { z } from "zod";

import {
  activationKeyProblem,
  DAY_CLOSE_WORDS,
  deviceIdProblem,
  serialNumberProblem,
  taxpayerNumberProblem,
  UNREACHABLE_WORDS,
  vatNumberProblem,
} from "@/lib/retail/fiscal-words";
import { formatDay } from "@/lib/workspace/format";

import type { SettingsPage } from "./types";

/**
 * Setup › Fiscal device (`/retail/manage/fiscal`, board FiscalSettings, W-06):
 * the shop's ZIMRA device and its numbers, how the fiscal day closes, and
 * what the tills do while ZIMRA cannot be reached (10-setup 5.9). The owner
 * changes it; the manager and the bookkeeper read it.
 *
 * Read-only values the page loads beside its settings: `connection` and
 * `connectionState`, `registered`, `openDay` and the newest five `days`. The
 * activation key is not kept: "Connect" sends it to ZIMRA (the page's action,
 * after the device's numbers are saved).
 */

/** Typed text, trimmed, checked by a rule that returns a sentence or null. */
function typed(problem: (value: string) => string | null, message: string) {
  return z
    .string({ message })
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      const found = problem(value);
      if (found) ctx.addIssue({ code: "custom", message: found });
    });
}

const notConnected = (values: Record<string, unknown>) => values.registered === false;

export const fiscalPage: SettingsPage = {
  title: "Fiscal device",
  read: ["retail.fiscal", "view"],
  change: ["retail.fiscal", "update"],
  whoCanChange: "Owners only. Device details come from ZIMRA when you register.",
  sections: [
    {
      title: "The device",
      fields: [
        {
          id: "connection",
          t: "read",
          l: "Connection",
          tone: (values) =>
            values.connectionState === "CONNECTED" ? "ok" : values.connectionState === "UNREACHABLE" ? "warn" : undefined,
        },
        { id: "deviceId", t: "text", l: "Device ID", half: true, mono: true },
        { id: "serialNumber", t: "text", l: "Serial number", half: true, mono: true },
        { id: "taxpayerNumber", t: "text", l: "Taxpayer number", half: true, mono: true },
        { id: "vatNumber", t: "text", l: "VAT number", half: true, mono: true },
        {
          id: "activationKey",
          t: "text",
          l: "Activation key",
          half: true,
          mono: true,
          opt: true,
          optQuiet: true,
          show: (values, ctx) => notConnected(values) && ctx.can("retail.fiscal", "update"),
        },
      ],
    },
    {
      title: "Fiscal days",
      fields: [
        {
          id: "dayClose",
          t: "seg",
          l: "Close the fiscal day",
          o: [DAY_CLOSE_WORDS.WITH_LAST_SHIFT, DAY_CLOSE_WORDS.BY_HAND],
          // The board's "A day left open blocks tomorrow’s sales" is not what happens: an open day takes them (98-decisions, honest version).
          h: "Closing sends the Z-report to ZIMRA. A day left open takes tomorrow’s sales too.",
        },
        {
          id: "whenUnreachable",
          t: "seg",
          l: "If ZIMRA cannot be reached",
          o: [UNREACHABLE_WORDS.KEEP_SELLING, UNREACHABLE_WORDS.STOP_SELLING],
        },
      ],
    },
  ],
  aside: [
    { title: "Fiscal days", slot: "days" },
    { title: "Who can change this", text: "Owners only. Device details come from ZIMRA when you register." },
  ],
  schema: z.object({
    deviceId: typed(deviceIdProblem, "Type the device ID."),
    serialNumber: typed(serialNumberProblem, "Type the serial number."),
    taxpayerNumber: typed(taxpayerNumberProblem, "Type the taxpayer number."),
    vatNumber: typed(vatNumberProblem, "Type the VAT number."),
    activationKey: typed(activationKeyProblem, "Type the activation key."),
    dayClose: z.enum([DAY_CLOSE_WORDS.WITH_LAST_SHIFT, DAY_CLOSE_WORDS.BY_HAND], {
      message: "Choose with the last shift or by hand.",
    }),
    whenUnreachable: z.enum([UNREACHABLE_WORDS.KEEP_SELLING, UNREACHABLE_WORDS.STOP_SELLING], {
      message: "Choose keep selling or stop selling.",
    }),
  }),
  // "Connect" registers the saved device with ZIMRA (C-14: its own endpoint), once the numbers above are saved.
  action: {
    fields: ["activationKey"],
    endpoint: "/api/v2/retail/fiscal/connect",
    can: ["retail.fiscal", "update"],
    after: true,
  },
  lastChangedLine: (lastChanged, now) => {
    if (lastChanged.what !== "registered") return null;
    const day = formatDay(lastChanged.at);
    const year = formatDay(now).split(" ").pop()!;
    return `Registered by ${lastChanged.by}, ${day.endsWith(` ${year}`) ? day.slice(0, -(year.length + 1)) : day}.`;
  },
};
