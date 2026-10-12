# Vane

Vane is the product's helper that reads what a person could read, notices what needs doing, and drafts the work. It runs on Claude, made by Anthropic. In the product it is only ever called Vane; Claude is named once, on Management → Vane.

Vane never sends, pays, saves, approves or changes anything on its own. A person presses the button each time.

## What is built so far

Only the connection to Claude: `lib/vane/claude.ts`.

| Piece | What it does |
| --- | --- |
| `askClaude({ system, messages, maxTokens })` | One request, one text answer, and the tokens it cost (input, output, cache read, cache write). The system prompt is sent with `cache_control`, so a stable prompt is billed at the cache rate after the first call. |
| `vaneModel()` | The model, from `VANE_MODEL`. Unset is a configuration error raised before any request. |
| `vaneClient()` | One SDK client per server process. The SDK reads `ANTHROPIC_API_KEY` itself. |
| `VaneError` | Every way a request can fall short, with `code` and `retryable`: `misconfigured` (no model; key or model refused), `rate-limited`, `unavailable` (no connection or a server error), `refused` (Claude declined), `cut-off` (ran past `maxTokens`). |

`lib/vane/claude.test.ts` covers each of these with a stand-in for the SDK client; no test calls Claude.

## Setting it up

1. Put the key in `ANTHROPIC_API_KEY` and the model in `VANE_MODEL` (see `.env.example`). Server only: never prefix either with `NEXT_PUBLIC_`.
2. Run `pnpm vane:ping`. It sends one short request and prints which model answered and what it cost, or the `VaneError` code and message.

## Not built yet

The tables Vane writes to (its cards, plans and jobs), the worker that runs its jobs, the tools it reads reports with, its pages and the Vane button. The designs are on the Core modules canvas, Vane page.
