import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PrintNow } from "@/components/books/print-now";
import { Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { authOptions } from "@/lib/auth";
import { money } from "@/lib/books/format";
import { readStatements } from "@/lib/books/statements";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Statements" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Books → Invoices → Print statements: one statement a page for each customer chosen. */
export default async function BooksStatementsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const raw = (await searchParams).customers;
  const ids = (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  const [{ asOf, statements }, company] = await Promise.all([
    readStatements(prisma, session.user.companyId, ids),
    prisma.company.findUnique({ where: { id: session.user.companyId }, select: { name: true } }),
  ]);
  return (
    <>
      <PageChrome title="Statements" backHref="/books/invoices" backLabel="Invoices" />
      <Kit>
        <PrintNow />
        {statements.length === 0 ? (
          <p className="muted" style={{ padding: "var(--space-24)" }}>
            Choose the customers in Invoices, then Print statements.
          </p>
        ) : (
          statements.map((statement) => (
            <article key={statement.customer.id} className="doc" style={{ breakAfter: "page", padding: "var(--space-32) var(--space-24)", maxWidth: 760 }}>
              <p className="muted">{company?.name}</p>
              <h2 style={{ fontSize: "var(--text-20)", fontWeight: 600, color: "var(--color-ink)", margin: "var(--space-8) 0" }}>
                Statement for {statement.customer.name}
              </h2>
              <p className="muted">
                As of {asOf}
                {statement.customer.address ? ` · ${statement.customer.address}` : ""}
              </p>
              {statement.lines.length === 0 ? (
                <p style={{ marginTop: "var(--space-16)" }}>Nothing is owed.</p>
              ) : (
                <table className="table" style={{ marginTop: "var(--space-16)" }}>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Written</th>
                      <th>When</th>
                      <th className="num">Total</th>
                      <th className="num">Owing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.lines.map((line) => (
                      <tr key={line.number}>
                        <td>
                          <span className="code">{line.number}</span>
                        </td>
                        <td>{line.written}</td>
                        <td className="muted">{line.when}</td>
                        <td className="num">{money(line.total, line.currency)}</td>
                        <td className="num" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                          {money(line.balance, line.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {statement.owing.map((owing) => (
                <p key={owing.currency} className="lede-figure" style={{ marginTop: "var(--space-16)", fontSize: "var(--text-20)" }}>
                  <span className="num">{money(owing.amount, owing.currency)}</span> is owing.
                </p>
              ))}
            </article>
          ))
        )}
      </Kit>
    </>
  );
}
