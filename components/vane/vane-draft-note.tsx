import * as React from "react";

import { VaneMark } from "@/components/core";

/**
 * The line across the top of a record Vane drafted (PageVaneDraft,
 * PageVaneMine): that it is Vane's, what it was made from, and that nothing
 * goes anywhere until a person says so.
 */
export function VaneDraftNote({ children, end }: { children: React.ReactNode; end?: React.ReactNode }) {
  return (
    <div className="vn-draft" role="note">
      <VaneMark size={16} />
      <span className="t">{children}</span>
      {end ? <span className="end">{end}</span> : null}
    </div>
  );
}
