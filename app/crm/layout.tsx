import type { ReactNode } from "react";

import { BooksGlyphs } from "@/components/books/icons/register-glyphs";

/**
 * The CRM's own layout is deliberately thin. Global search used to live here,
 * which made "find anything" a CRM-only affordance; it now sits in the navbar
 * and is reachable from every page in the app.
 */
export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BooksGlyphs />
      <div className="space-y-4">{children}</div>
    </>
  );
}
