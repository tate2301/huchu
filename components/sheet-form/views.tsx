"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { RolesView } from "@/lib/retail/roles-matrix";
import type { SheetCtx } from "@/lib/workspace/sheet-kind";

/**
 * Sheet bodies that are not a form, by the kind's `view` key. One today:
 * "roles", the Who can do what table (80-admin 5.4).
 */
export function SheetView({ name, ctx }: { name: string; ctx: SheetCtx }) {
  if (name === "roles") return <RolesMatrix ctx={ctx} />;
  return null;
}

const APPROVALS = "Setup › Approvals";

/**
 * The Roles board as the server enforces it (`GET /api/v2/retail/roles`):
 * the lede, one table of seven sections and 32 rows, each cell's letters as
 * chips (D filled), and the live limit sentences, linked where they name a
 * setting. Nothing here is typed into the page.
 */
function RolesMatrix({ ctx }: { ctx: SheetCtx }) {
  const roles = useQuery({ queryKey: ["retail-roles"], queryFn: () => fetchJson<RolesView>("/api/v2/retail/roles") });
  if (roles.isPending) return <div className="sf-roles" aria-busy="true" />;
  if (roles.isError || !roles.data) {
    return (
      <div className="sf-roles">
        <p role="alert" className="sf-roles__lede">
          Who can do what would not load. Close this and open it again.
        </p>
      </div>
    );
  }
  const view = roles.data;
  const canSeeApprovals = ctx.can("retail.approvals", "view");
  const [before, after] = view.intro.split(APPROVALS);
  return (
    <div className="sf-roles">
      <p className="sf-roles__lede">
        {before}
        {after !== undefined ? (
          <>
            {canSeeApprovals ? <Link href="/retail/manage/approvals">{APPROVALS}</Link> : APPROVALS}
            {after}
          </>
        ) : null}
      </p>
      <div className="sf-roles__scroll">
        <table className="sf-roles__table">
          <thead>
            <tr>
              <th scope="col" className="sf-roles__record">
                Record
              </th>
              {view.columns.map((column) => (
                <th key={column.key} scope="col" className="sf-roles__role">
                  <span className="sf-roles__role-name">{column.label}</span>
                  <span className="sf-roles__role-sub">{column.sub}</span>
                </th>
              ))}
              <th scope="col" className="sf-roles__limits">
                Limits
              </th>
            </tr>
          </thead>
          {view.sections.map((section) => (
            <tbody key={section.title}>
              <tr className="sf-roles__section">
                <th scope="rowgroup" colSpan={view.columns.length + 2}>
                  {section.title}
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="sf-roles__record">
                    {row.label}
                  </th>
                  {view.columns.map((column) => {
                    const letters = row.cells[column.key] ?? "";
                    return (
                      <td key={column.key} className="sf-roles__cell">
                        {letters ? (
                          <span className="sf-roles__chips" aria-label={letters.split("").join(" ")}>
                            {letters.split("").map((letter) => (
                              <span key={letter} className={letter === "D" ? "sf-roles__chip sf-roles__chip--d" : "sf-roles__chip"}>
                                {letter}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="sf-roles__none">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="sf-roles__limit">
                    {row.limit && row.limitHref ? <Link href={row.limitHref}>{row.limit}</Link> : row.limit}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
