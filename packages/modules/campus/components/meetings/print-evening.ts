"use client";

/**
 * A teacher's evening, on paper.
 *
 * The desk a teacher sits at in the hall has no screen on it. What they carry
 * is a list of times and names, so the evening prints as one — and a blocked
 * pop-up returns `false` rather than silently doing nothing, because a button
 * that does nothing and says nothing is the worst thing on a screen.
 */

export type PrintableSlot = {
  /** "17:00 – 17:10". */
  when: string;
  /** "12 March 2026" — repeated per row so a two-night evening still reads. */
  day: string;
  /** "Mutasa, Tanaka", or the free-slot sentence. */
  who: string;
  /** "CHS-1219 · Form 2A · Room 4". */
  detail: string;
  /** "Grace Mutasa · 077 412 8890", or empty. */
  guardian: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Returns false when the browser refused the window, so the caller can say so. */
export function printEvening({
  teacherName,
  rows,
}: {
  teacherName: string;
  rows: PrintableSlot[];
}): boolean {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;

  const body = rows
    .map(
      (row) => `
      <tr>
        <td class="mono">${escapeHtml(row.when)}</td>
        <td class="mono">${escapeHtml(row.day)}</td>
        <td><strong>${escapeHtml(row.who)}</strong><div class="muted">${escapeHtml(row.detail)}</div></td>
        <td>${escapeHtml(row.guardian)}</td>
      </tr>`,
    )
    .join("");

  printWindow.document.write(`<!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(teacherName)} — parents' evening</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          p.lede { font-size: 12px; color: #565C69; margin: 0 0 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #E5E8EE; padding: 6px 8px; text-align: left; vertical-align: top; }
          th { background: #F7F8FA; font-weight: 600; }
          .mono { font-family: ui-monospace, SFMono-Regular, monospace; white-space: nowrap; }
          .muted { color: #8A91A0; font-size: 11px; margin-top: 2px; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(teacherName)}</h1>
        <p class="lede">Parents&rsquo; evening &mdash; ${rows.length} slot${rows.length === 1 ? "" : "s"}</p>
        <table>
          <thead>
            <tr><th>Time</th><th>Day</th><th>Pupil</th><th>Who is coming</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  return true;
}
