/**
 * Outbound HTTP for the payment adapters.
 *
 * Same shape as `lib/accounting/fdms-connector.ts` — `node:http`/`node:https`
 * behind a promise, an explicit timeout, the response body returned as a raw
 * string and never parsed here. Deliberately the same: the two connectors have
 * the same failure modes (a Zimbabwean gateway that stops answering mid-request)
 * and one house pattern for them is easier to reason about than two.
 *
 * The body stays a string because both webhook verification and settlement
 * disputes need the bytes the gateway actually sent, and because Paynow answers
 * in `application/x-www-form-urlencoded` while the other two answer in JSON.
 */
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export const DEFAULT_PAYMENT_TIMEOUT_MS = 20_000;

export type GatewayResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
};

export type GatewayRequest = {
  method: "GET" | "POST";
  /** Absolute URL, or a path resolved against `baseUrl`. */
  url: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

export async function gatewayRequest(input: GatewayRequest): Promise<GatewayResponse> {
  const url = input.baseUrl ? new URL(input.url, input.baseUrl) : new URL(input.url);
  const payload = input.body;
  const timeout = input.timeoutMs ?? DEFAULT_PAYMENT_TIMEOUT_MS;

  return new Promise<GatewayResponse>((resolve, reject) => {
    const requestFn = url.protocol === "http:" ? http.request : https.request;
    const req = requestFn(
      url,
      {
        method: input.method,
        timeout,
        headers: {
          ...(payload ? { "Content-Length": Buffer.byteLength(payload).toString() } : {}),
          ...(input.headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(", ");
          }
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            headers,
          });
        });
      },
    );

    // A gateway that accepts the connection and then goes quiet would otherwise
    // hold a checkout request open until the platform's own timeout kills it.
    req.on("timeout", () => {
      req.destroy(new Error(`Payment gateway request to ${url.host} timed out after ${timeout}ms`));
    });
    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

export function postForm(input: {
  url: string;
  baseUrl?: string;
  fields: Record<string, string>;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<GatewayResponse> {
  return gatewayRequest({
    method: "POST",
    url: input.url,
    baseUrl: input.baseUrl,
    body: encodeForm(input.fields),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(input.headers ?? {}),
    },
    timeoutMs: input.timeoutMs,
  });
}

export function postJson(input: {
  url: string;
  baseUrl?: string;
  body: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): Promise<GatewayResponse> {
  return gatewayRequest({
    method: "POST",
    url: input.url,
    baseUrl: input.baseUrl,
    body: JSON.stringify(input.body),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(input.headers ?? {}),
    },
    timeoutMs: input.timeoutMs,
  });
}

export function encodeForm(fields: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.append(key, value);
  return params.toString();
}

/** Parse `a=1&b=2` into a plain object. Paynow speaks this in both directions,
 *  including in its webhook body, so both the adapter and its tests need it. */
export function decodeForm(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw.trim());
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}

export function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
