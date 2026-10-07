import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  isWhatsAppConfigured,
  sendMedia,
  sendTemplate,
  sendText,
  templateParam,
  verifyWhatsAppSignature,
  whatsAppChallenge,
  whatsAppNumber,
  WHATSAPP_NOT_SET_UP,
} from "./whatsapp";
import { whatsAppEvents } from "./whatsapp-webhook";

const config = { token: "token-1", phoneNumberId: "1098" };

function answering(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("the WhatsApp adapter", () => {
  it("is set up only with a token and a phone number id", () => {
    expect(isWhatsAppConfigured({ META_WHATSAPP_TOKEN: "t", META_WHATSAPP_PHONE_NUMBER_ID: "1" })).toBe(true);
    expect(isWhatsAppConfigured({ META_WHATSAPP_TOKEN: "t" })).toBe(false);
    expect(isWhatsAppConfigured({})).toBe(false);
  });

  it("sends nothing while it is not set up, and says so", async () => {
    const fetcher = vi.fn();
    expect(await sendText("+263772123456", "Hi", { config: null, fetcher })).toEqual({
      ok: false,
      error: WHATSAPP_NOT_SET_UP,
      retry: true,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends text to Meta's Cloud API, the number as digits, and keeps Meta's id", async () => {
    const fetcher = answering(200, { messages: [{ id: "wamid.ABC" }] });
    expect(await sendText("+263 77 212 3456", "Your receipt", { config, fetcher })).toEqual({ ok: true, id: "wamid.ABC" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v21.0/1098/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "263772123456",
      type: "text",
      text: { preview_url: false, body: "Your receipt" },
    });
  });

  it("sends what the shop starts as an approved template: its name, its language, the body's values in order", async () => {
    const fetcher = answering(200, { messages: [{ id: "wamid.TPL" }] });
    const receipt = "   HARARE BOTTLE STORE\n--------------------------------\nCastle Lager 340ml x6      7.20\nTOTAL US$                  9.30";
    expect(await sendTemplate("+263 77 212 3456", { name: "receipt", params: ["Harare Bottle Store", receipt] }, { config, fetcher })).toEqual({
      ok: true,
      id: "wamid.TPL",
    });
    expect(JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "263772123456",
      type: "template",
      template: {
        name: "receipt",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Harare Bottle Store" },
              { type: "text", text: "HARARE BOTTLE STORE · Castle Lager 340ml x6 7.20 · TOTAL US$ 9.30" },
            ],
          },
        ],
      },
    });
  });

  it("carries a template's document as its header, in the language asked for", async () => {
    const fetcher = answering(200, { messages: [{ id: "wamid.HDR" }] });
    await sendTemplate(
      "+263772123456",
      {
        name: "order",
        language: "en_GB",
        params: ["Harare Bottle Store", "PO-0003"],
        header: { url: "https://x.test/po.pdf", kind: "DOCUMENT", name: "PO-0003.pdf" },
      },
      { config, fetcher },
    );
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.template.language).toEqual({ code: "en_GB" });
    expect(body.template.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "document", document: { link: "https://x.test/po.pdf", filename: "PO-0003.pdf" } }],
    });
  });

  it("makes a template value Meta takes: no new lines, tabs or runs of spaces, kept to 900 characters", () => {
    const value = templateParam("a\tb     c\r\n\n====\nd");
    expect(value).toBe("a b c · d");
    expect(templateParam("x".repeat(1200))).toHaveLength(900);
  });

  it("sends a document by its address with the text as its caption", async () => {
    const fetcher = answering(200, { messages: [{ id: "wamid.DOC" }] });
    await sendMedia("+263772123456", { url: "https://x.test/po.pdf", kind: "DOCUMENT", name: "PO-0003.pdf", caption: "Order" }, { config, fetcher });
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.type).toBe("document");
    expect(body.document).toEqual({ link: "https://x.test/po.pdf", filename: "PO-0003.pdf", caption: "Order" });
  });

  it("tries again after a busy answer, not after a refusal of the message", async () => {
    expect(await sendText("+263772123456", "x", { config, fetcher: answering(429, { error: { message: "Too many" } }) })).toEqual({
      ok: false,
      error: "Too many",
      retry: true,
    });
    expect(
      await sendText("+263772123456", "x", { config, fetcher: answering(400, { error: { message: "Invalid parameter" } }) }),
    ).toEqual({ ok: false, error: "Invalid parameter", retry: false });
    expect(await sendText("12", "x", { config, fetcher: vi.fn() })).toMatchObject({ ok: false, retry: false });
  });

  it("reads a number as Meta takes it", () => {
    expect(whatsAppNumber("+263 772 123 456")).toBe("263772123456");
    expect(whatsAppNumber("abc")).toBeNull();
  });
});

describe("the webhook's checks", () => {
  it("accepts Meta's signature over the raw body and nothing else", () => {
    const body = '{"entry":[]}';
    const signature = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, signature, "secret")).toBe(true);
    expect(verifyWhatsAppSignature(`${body} `, signature, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, signature, "other")).toBe(false);
    expect(verifyWhatsAppSignature(body, null, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, signature, undefined)).toBe(false);
  });

  it("answers the subscribe challenge only with the verify token", () => {
    const params = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "v", "hub.challenge": "42" });
    expect(whatsAppChallenge(params, "v")).toBe("42");
    expect(whatsAppChallenge(params, "w")).toBeNull();
    expect(whatsAppChallenge(params, undefined)).toBeNull();
  });

  it("reads statuses and messages out of a delivery", () => {
    const events = whatsAppEvents({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "1098" },
                statuses: [
                  { id: "wamid.A", status: "delivered", timestamp: "1700000000", recipient_id: "263772123456" },
                  { id: "wamid.B", status: "failed", errors: [{ title: "Re-engagement message" }] },
                ],
                messages: [{ id: "wamid.C", from: "263772123456", timestamp: "1700000100", text: { body: "Thanks" } }],
              },
            },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: "status", id: "wamid.A", status: "delivered", at: new Date(1700000000 * 1000), recipient: "263772123456", error: null },
      { kind: "status", id: "wamid.B", status: "failed", at: null, recipient: null, error: "Re-engagement message" },
      { kind: "message", id: "wamid.C", from: "263772123456", text: "Thanks", at: new Date(1700000100 * 1000), phoneNumberId: "1098" },
    ]);
    expect(whatsAppEvents(null)).toEqual([]);
    expect(whatsAppEvents({ entry: "nope" })).toEqual([]);
  });
});
