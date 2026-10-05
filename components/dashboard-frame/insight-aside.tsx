import Link from "next/link";

import { ChevronRight } from "@/lib/icons";

export type SendState = {
  /** Off: what turning it on does ("This page, as a picture and three lines, …"). */
  words: string;
  /** On: what it does now ("Every Monday at 07:00 on WhatsApp, to …"); null while off. */
  onWords: string | null;
  onSend: () => void;
  busy?: boolean;
  error?: string | null;
};

/**
 * The insight aside: "What it says" in up to three bullets, "Do something
 * about it" as outline rows that each go somewhere, and — when the page
 * offers it — "Send me this".
 */
export function InsightAside({
  findings,
  actions,
  send,
  fallback = "Not enough trade in these dates to say.",
}: {
  findings: ReadonlyArray<string>;
  actions: ReadonlyArray<{ label: string; href: string }>;
  /** "Send me this" (W-56); left out until the page can send. */
  send?: SendState | null;
  fallback?: string;
}) {
  return (
    <>
      <section className="cx-df-aside__section">
        <h2>What it says</h2>
        {findings.length > 0 ? (
          <ul className="cx-df-aside__bullets">
            {findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        ) : (
          <p className="cx-df-tone-muted">{fallback}</p>
        )}
      </section>
      {actions.length > 0 ? (
        <section className="cx-df-aside__section cx-df-aside__section--actions">
          <h2>Do something about it</h2>
          {actions.map((action) => (
            <Link key={action.href} href={action.href} className="cx-df-aside__do">
              <span>{action.label}</span>
              <ChevronRight aria-hidden="true" />
            </Link>
          ))}
        </section>
      ) : null}
      {send ? (
        <section className="cx-df-aside__section">
          <h2>Send me this</h2>
          {send.onWords ? (
            <span role="status" className="cx-df-aside__on">
              {send.onWords}
            </span>
          ) : (
            <>
              <span className="cx-df-aside__words">{send.words}</span>
              <button type="button" className="cx-df-aside__send" onClick={send.onSend} disabled={send.busy} aria-busy={send.busy || undefined}>
                Send it every Monday
              </button>
              {send.error ? <span className="cx-df-tone-bad">{send.error}</span> : null}
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
