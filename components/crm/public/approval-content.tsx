"use client";

import * as React from "react";

export type ApprovalDoc = {
  companyName: string;
  documentType: "QUOTATION" | "INVOICE" | "RECEIPT";
  status: string;
  number: string;
  currency: string;
  total: number;
  subTotal: number;
  taxTotal: number;
  issuedAt: string | null;
  validUntil: string | null;
  dueDate: string | null;
  notes: string | null;
  billedTo: string | null;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    lineTotal: number;
  }>;
  branding: {
    logoUrl: string | null;
    primaryColor: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    physicalAddress: string | null;
    registrationNumber: string | null;
    vatNumber: string | null;
    paymentRows: Array<{ label: string; value: string }>;
    paymentTerms: string | null;
    footerText: string | null;
  };
  linkState: "ACTIVE" | "EXPIRED" | "REVOKED";
};

const DOC_LABELS: Record<ApprovalDoc["documentType"], string> = {
  QUOTATION: "Quotation",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
};

const DEFAULT_ACCENT = "#4b5563";

function money(currency: string, value: number): string {
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function parseHex(value: string | null | undefined): [number, number, number] | null {
  const raw = (value ?? "").trim().replace(/^#/, "");
  const full = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** Ink that stays legible on the brand colour — see the same rule in the PDF renderer. */
function inkOn(value: string): string {
  const rgb = parseHex(value);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#18181b" : "#ffffff";
}

function tint(value: string, alpha: number): string {
  const rgb = parseHex(value);
  if (!rgb) return "transparent";
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("") || "•";
}

/** The item name, with anything the rep wrote under it on its own line. */
function splitItemText(text: string): { name: string; detail: string } {
  const newline = text.indexOf("\n");
  if (newline === -1) return { name: text, detail: "" };
  return { name: text.slice(0, newline).trim(), detail: text.slice(newline + 1).trim() };
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-neutral-200 pt-2.5">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">{title}</p>
      <div className="mt-1.5 space-y-0.5 text-sm text-neutral-700">{children}</div>
    </div>
  );
}

/**
 * The client-facing copy of a quotation or invoice.
 *
 * This is the only surface many clients ever see, so it renders as the actual
 * branded document — logo, line items, tax, terms, bank details — rather than
 * a summary, and to the same layout as the PDF the same record prints to: a
 * masthead, one brand rule, the title, a Bill to / Details / Payment band,
 * then the items and the answer. It deliberately does not use the app's
 * design system: it stands alone on the company's branding, on someone else's
 * phone.
 */
export function ApprovalContent({ token }: { token: string }) {
  const [doc, setDoc] = React.useState<ApprovalDoc | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    fetch(`/api/public/crm/approvals/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok || !data.ok) setLoadError(data.error ?? "Document not found.");
        else setDoc(data.document as ApprovalDoc);
      })
      .catch(() => active && setLoadError("Document not found."));
    return () => {
      active = false;
    };
  }, [token]);

  async function respond(action: "APPROVE" | "DECLINE") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/crm/approvals/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: name || undefined, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) setError(data.error ?? "Could not record your response.");
      else setResult(data.status);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) return <Notice>{loadError}</Notice>;
  if (!doc) return <Notice>Loading…</Notice>;

  const alreadyResolved = doc.status !== "PENDING" || Boolean(result);
  const finalStatus = result ?? doc.status;
  const accent = doc.branding.primaryColor || DEFAULT_ACCENT;
  const label = DOC_LABELS[doc.documentType];

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-6 sm:py-10 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-4">
        <ApprovalDocument doc={doc} />

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 print:hidden">
          {alreadyResolved ? (
            <p className="text-center text-neutral-700">
              You&apos;ve already responded — this {label.toLowerCase()} is{" "}
              <strong>{finalStatus.toLowerCase()}</strong>. Get in touch if something needs to
              change.
            </p>
          ) : doc.linkState === "REVOKED" ? (
            <p className="text-center text-neutral-700">
              This link has been replaced. Please use the most recent one we sent you.
            </p>
          ) : doc.linkState === "EXPIRED" ? (
            <p className="text-center text-neutral-700">This link has expired.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                Happy with this {label.toLowerCase()}? Approving lets us get started.
              </p>
              <input
                className="w-full rounded-[10px] border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                className="w-full rounded-[10px] border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                rows={2}
                placeholder="Add a note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  disabled={submitting}
                  onClick={() => respond("APPROVE")}
                  className="flex-1 rounded-[10px] px-4 py-3 font-medium disabled:opacity-60"
                  style={{ backgroundColor: accent, color: inkOn(accent) }}
                >
                  {submitting ? "Sending…" : "Approve"}
                </button>
                <button
                  disabled={submitting}
                  onClick={() => respond("DECLINE")}
                  className="flex-1 rounded-[10px] border border-neutral-300 px-4 py-3 font-medium text-neutral-800 disabled:opacity-60"
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="text-center text-sm text-neutral-400 print:hidden">{doc.companyName}</p>
      </div>
    </div>
  );
}

/**
 * The document itself, as the customer sees it — the same shape the PDF of
 * this record prints to: masthead, one brand rule, the title, a Bill to /
 * Details / Payment band, then the items and the answer.
 *
 * Split out of the page shell so the states that matter can be asserted
 * without a browser: what a withheld link shows, and what it does not.
 */
export function ApprovalDocument({ doc }: { doc: ApprovalDoc }) {
  const accent = doc.branding.primaryColor || DEFAULT_ACCENT;
  const label = DOC_LABELS[doc.documentType];
  const withheld = doc.linkState !== "ACTIVE";
  const showTax = doc.lines.some((line) => line.taxRate > 0);
  const contact = [doc.branding.phone, doc.branding.email, doc.branding.website]
    .filter(Boolean)
    .join(" · ");
  const dated = doc.dueDate
    ? { title: "Due", value: formatDate(doc.dueDate) }
    : doc.validUntil
      ? { title: "Valid until", value: formatDate(doc.validUntil) }
      : null;

  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm print:border-0 print:shadow-none">
      <div className="p-5 sm:p-9">
        {/* Masthead — who is sending this, and which document it is. */}
        {/* Stacked on a phone, one row from `sm` up. Side by side on a narrow
            screen the sender's address is squeezed into a column two words
            wide, and the email breaks mid-word. */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {doc.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={doc.branding.logoUrl}
                alt={doc.companyName}
                className="h-12 w-auto max-w-[8rem] shrink-0 object-contain"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] text-base font-bold"
                style={{ backgroundColor: accent, color: inkOn(accent) }}
                aria-hidden
              >
                {initials(doc.companyName)}
              </div>
            )}
            <div className="min-w-0 text-sm leading-relaxed">
              <p className="font-semibold text-neutral-900">{doc.companyName}</p>
              <div className="text-neutral-500">
                {doc.branding.physicalAddress ? <p>{doc.branding.physicalAddress}</p> : null}
                {contact ? <p className="break-words">{contact}</p> : null}
                {doc.branding.registrationNumber ? (
                  <p>Reg. {doc.branding.registrationNumber}</p>
                ) : null}
                {doc.branding.vatNumber ? <p>VAT {doc.branding.vatNumber}</p> : null}
              </div>
            </div>
          </div>

          <div className="shrink-0 space-y-1.5 text-sm sm:text-right">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {label} no.
              </p>
              <p className="font-mono font-semibold text-neutral-900">{doc.number || "—"}</p>
            </div>
            {doc.issuedAt ? (
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  Issue date
                </p>
                <p className="font-mono font-semibold text-neutral-900">
                  {formatDate(doc.issuedAt)}
                </p>
              </div>
            ) : null}
          </div>
        </header>

        <div
          className="my-5 h-[5px] rounded-sm"
          style={{ backgroundColor: accent }}
          aria-hidden
        />

        <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{label}</h1>

        {withheld ? (
          <p className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">
            {doc.linkState === "REVOKED"
              ? `This link has been replaced, so the ${label.toLowerCase()} is no longer shown here. Ask us for the current copy and we'll send a fresh link.`
              : `This link has expired, so the pricing is no longer shown. Ask us for a fresh copy and we'll send one over.`}
          </p>
        ) : (
          <>
            <section className="mt-7 grid gap-5 sm:grid-cols-3">
              {doc.billedTo ? (
                <Field title={doc.documentType === "QUOTATION" ? "Prepared for" : "Bill to"}>
                  <p className="font-semibold text-neutral-900">{doc.billedTo}</p>
                </Field>
              ) : null}
              <Field title="Details">
                <p>Currency: {doc.currency}</p>
                {doc.issuedAt ? <p>Issued {formatDate(doc.issuedAt)}</p> : null}
              </Field>
              <Field title="Payment">
                {dated ? (
                  <p>
                    {dated.title} {dated.value}
                  </p>
                ) : null}
                <p className="font-semibold text-neutral-900">
                  {money(doc.currency, doc.total)}
                </p>
              </Field>
            </section>

            {/* The table collapses to stacked rows on a phone — a customer
                opening this on WhatsApp should not have to pan sideways to
                read what they are being charged for. */}
            <div className="mt-8">
              <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-x-6 border-b border-neutral-200 pb-2 text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500 sm:grid">
                <span>Item</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Amount</span>
              </div>
              <ul>
                {doc.lines.map((line, index) => {
                  const item = splitItemText(line.description);
                  return (
                    <li
                      key={index}
                      className="grid gap-x-6 border-b border-neutral-200 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900">{item.name}</p>
                        {item.detail ? (
                          <p className="mt-0.5 text-neutral-500">{item.detail}</p>
                        ) : null}
                      </div>
                      <p className="mt-1 text-neutral-600 sm:mt-0 sm:text-right sm:tabular-nums">
                        <span className="text-neutral-400 sm:hidden">Qty </span>
                        {line.quantity}
                        {showTax && line.taxRate > 0 ? (
                          <span className="text-neutral-400"> · {line.taxRate}% tax</span>
                        ) : null}
                      </p>
                      <p className="text-neutral-600 sm:text-right sm:tabular-nums">
                        <span className="text-neutral-400 sm:hidden">Price </span>
                        {money(doc.currency, line.unitPrice)}
                      </p>
                      <p className="font-medium text-neutral-900 sm:text-right sm:tabular-nums">
                        <span className="text-neutral-400 sm:hidden">Amount </span>
                        {money(doc.currency, line.lineTotal)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4 flex justify-end">
              <dl className="w-full max-w-xs text-sm">
                <div className="flex justify-between py-1 text-neutral-600">
                  <dt>Subtotal</dt>
                  <dd className="tabular-nums">{money(doc.currency, doc.subTotal)}</dd>
                </div>
                {doc.taxTotal > 0 ? (
                  <div className="flex justify-between py-1 text-neutral-600">
                    <dt>Tax</dt>
                    <dd className="tabular-nums">{money(doc.currency, doc.taxTotal)}</dd>
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-between border-t border-neutral-200 pt-3">
                  <dt className="text-base font-bold text-neutral-900">
                    {doc.documentType === "INVOICE" ? "Total due" : "Total"}
                  </dt>
                  <dd className="text-lg font-bold tabular-nums text-neutral-900">
                    {money(doc.currency, doc.total)}
                  </dd>
                </div>
              </dl>
            </div>
          </>
        )}

        {doc.notes ? (
          <section
            className="mt-7 rounded-r border-l-2 py-2.5 pl-3 pr-3"
            style={{ borderColor: accent, backgroundColor: tint(accent, 0.07) }}
          >
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
              Notes
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-700">{doc.notes}</p>
          </section>
        ) : null}

        {doc.branding.paymentRows.length > 0 ||
        doc.branding.paymentTerms ||
        doc.branding.footerText ? (
          <footer className="mt-9 border-t border-neutral-200 pt-3 text-sm text-neutral-500">
            {doc.branding.paymentRows.length > 0 ? (
              <>
                <p className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  Payment details
                </p>
                <dl className="mt-1 max-w-sm space-y-0.5">
                  {doc.branding.paymentRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-4">
                      <dt>{row.label}</dt>
                      <dd className="font-mono text-neutral-700">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            {doc.branding.paymentTerms ? (
              <p className="mt-3">{doc.branding.paymentTerms}</p>
            ) : null}
            {doc.branding.footerText ? (
              <p className="mt-1 text-neutral-400">{doc.branding.footerText}</p>
            ) : null}
          </footer>
        ) : null}
      </div>
    </article>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}
