"use client";

import * as React from "react";

type ApprovalDoc = {
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
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    paymentTerms: string | null;
    footerText: string | null;
  };
  expired: boolean;
};

const DOC_LABELS: Record<ApprovalDoc["documentType"], string> = {
  QUOTATION: "Quotation",
  INVOICE: "Invoice",
  RECEIPT: "Receipt",
};

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

/**
 * The client-facing copy of a quotation or invoice.
 *
 * This is the only surface many clients ever see, so it renders as the actual
 * branded document — logo, line items, tax, terms, bank details — rather than
 * a summary. It deliberately does not use the app's design system: it stands
 * alone on the company's branding, on someone else's phone.
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
  const accent = doc.branding.primaryColor || "#171717";
  const label = DOC_LABELS[doc.documentType];

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-3xl space-y-4">
        <article className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm print:border-0 print:shadow-none">
          <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />

          <div className="p-6 sm:p-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                {doc.branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={doc.branding.logoUrl}
                    alt={doc.companyName}
                    className="mb-2 h-12 w-auto object-contain"
                  />
                ) : (
                  <p className="text-lg font-semibold text-neutral-900">{doc.companyName}</p>
                )}
                <div className="text-sm leading-relaxed text-neutral-500">
                  {doc.branding.physicalAddress ? <p>{doc.branding.physicalAddress}</p> : null}
                  <p>
                    {[doc.branding.email, doc.branding.phone, doc.branding.website]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {doc.branding.registrationNumber ? (
                    <p>Reg. {doc.branding.registrationNumber}</p>
                  ) : null}
                  {doc.branding.vatNumber ? <p>VAT {doc.branding.vatNumber}</p> : null}
                </div>
              </div>

              <div className="text-right">
                <h1
                  className="text-2xl font-semibold tracking-tight"
                  style={{ color: accent }}
                >
                  {label}
                </h1>
                <p className="font-mono text-sm text-neutral-700">{doc.number}</p>
                {doc.issuedAt ? (
                  <p className="mt-1 text-sm text-neutral-500">
                    Issued {formatDate(doc.issuedAt)}
                  </p>
                ) : null}
                {doc.validUntil ? (
                  <p className="text-sm text-neutral-500">Valid until {formatDate(doc.validUntil)}</p>
                ) : null}
                {doc.dueDate ? (
                  <p className="text-sm text-neutral-500">Due {formatDate(doc.dueDate)}</p>
                ) : null}
              </div>
            </header>

            {doc.billedTo ? (
              <section className="mt-6">
                <p className="text-sm text-neutral-400">
                  {doc.documentType === "QUOTATION" ? "Prepared for" : "Billed to"}
                </p>
                <p className="text-sm font-medium text-neutral-900">{doc.billedTo}</p>
              </section>
            ) : null}

            {doc.expired ? (
              <p className="mt-6 rounded-[var(--radius-md)] bg-neutral-50 p-4 text-center text-sm text-neutral-600">
                This link has expired, so the pricing is no longer shown. Ask us for a fresh copy
                and we&apos;ll send one over.
              </p>
            ) : (
              <>
                <div className="mt-6 -mx-2 overflow-x-auto px-2">
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-sm text-neutral-400">
                        <th className="py-2 font-medium">Description</th>
                        <th className="py-2 text-right font-medium">Qty</th>
                        <th className="py-2 text-right font-medium">Unit price</th>
                        {doc.lines.some((line) => line.taxRate > 0) ? (
                          <th className="py-2 text-right font-medium">Tax</th>
                        ) : null}
                        <th className="py-2 text-right font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.lines.map((line, index) => (
                        <tr key={index} className="border-b border-neutral-100 align-top">
                          <td className="py-2.5 pr-3 text-neutral-800">{line.description}</td>
                          <td className="py-2.5 text-right tabular-nums text-neutral-600">
                            {line.quantity}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-neutral-600">
                            {money(doc.currency, line.unitPrice)}
                          </td>
                          {doc.lines.some((entry) => entry.taxRate > 0) ? (
                            <td className="py-2.5 text-right tabular-nums text-neutral-600">
                              {line.taxRate > 0 ? `${line.taxRate}%` : "—"}
                            </td>
                          ) : null}
                          <td className="py-2.5 text-right tabular-nums text-neutral-900">
                            {money(doc.currency, line.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex justify-end">
                  <dl className="w-full max-w-xs space-y-1 text-sm">
                    <div className="flex justify-between text-neutral-600">
                      <dt>Subtotal</dt>
                      <dd className="tabular-nums">{money(doc.currency, doc.subTotal)}</dd>
                    </div>
                    {doc.taxTotal > 0 ? (
                      <div className="flex justify-between text-neutral-600">
                        <dt>Tax</dt>
                        <dd className="tabular-nums">{money(doc.currency, doc.taxTotal)}</dd>
                      </div>
                    ) : null}
                    <div
                      className="flex justify-between border-t border-neutral-200 pt-1.5 text-base font-semibold text-neutral-900"
                      style={{ borderColor: accent }}
                    >
                      <dt>Total</dt>
                      <dd className="tabular-nums">{money(doc.currency, doc.total)}</dd>
                    </div>
                  </dl>
                </div>
              </>
            )}

            {doc.notes ? (
              <section className="mt-6 border-t border-neutral-100 pt-4">
                <p className="text-sm text-neutral-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{doc.notes}</p>
              </section>
            ) : null}

            {doc.branding.bankAccountNumber ? (
              <section className="mt-6 rounded-[var(--radius-md)] bg-neutral-50 p-4">
                <p className="text-sm text-neutral-400">Payment details</p>
                <dl className="mt-1 space-y-0.5 text-sm text-neutral-700">
                  {doc.branding.bankName ? (
                    <div className="flex gap-2">
                      <dt className="text-neutral-500">Bank</dt>
                      <dd>{doc.branding.bankName}</dd>
                    </div>
                  ) : null}
                  {doc.branding.bankAccountName ? (
                    <div className="flex gap-2">
                      <dt className="text-neutral-500">Account name</dt>
                      <dd>{doc.branding.bankAccountName}</dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="text-neutral-500">Account number</dt>
                    <dd className="font-mono">{doc.branding.bankAccountNumber}</dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {doc.branding.paymentTerms ? (
              <p className="mt-4 text-sm text-neutral-500">{doc.branding.paymentTerms}</p>
            ) : null}
            {doc.branding.footerText ? (
              <p className="mt-2 text-sm text-neutral-400">{doc.branding.footerText}</p>
            ) : null}
          </div>
        </article>

        <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm print:hidden">
          {alreadyResolved ? (
            <p className="text-center text-neutral-700">
              You&apos;ve already responded — this {label.toLowerCase()} is{" "}
              <strong>{finalStatus.toLowerCase()}</strong>. Get in touch if something needs to
              change.
            </p>
          ) : doc.expired ? (
            <p className="text-center text-neutral-700">This link has expired.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-neutral-600">
                Happy with this {label.toLowerCase()}? Approving lets us get started.
              </p>
              <input
                className="w-full rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <textarea
                className="w-full rounded-[var(--radius-md)] border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900"
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
                  className="flex-1 rounded-[10px] px-4 py-3 font-medium text-white disabled:opacity-60"
                  style={{ backgroundColor: accent }}
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}
