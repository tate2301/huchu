import * as React from "react";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BooksStatementsView } from "@/components/books/statements-view";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Customer Statements · Books",
};

export default async function BooksStatementsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <React.Suspense
      fallback={
        <div style={{ padding: "var(--space-48)", textAlign: "center" }} className="muted">
          Loading statements…
        </div>
      }
    >
      <BooksStatementsView />
    </React.Suspense>
  );
}
