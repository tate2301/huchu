"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

type Rows = { columns: string[]; rows: Array<Record<string, unknown>>; more: boolean; sql: string };

const cell = (value: unknown) => (value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value));

/**
 * "Show the rows": the rows behind something Vane could not work out, read
 * again when asked, in a plain table under the state's line.
 */
export function ProblemRows({ jobId }: { jobId: string }) {
  const [open, setOpen] = React.useState(false);
  const rows = useQuery({
    queryKey: ["vane", "problem-rows", jobId],
    queryFn: () => fetchJson<Rows>(`/api/vane/jobs/${jobId}/rows`),
    enabled: open,
    retry: false,
  });
  const regionId = React.useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)", width: "100%" }}>
      <Button icon="table" aria-expanded={open} aria-controls={regionId} busy={open && rows.isLoading} onClick={() => setOpen((shown) => !shown)}>
        {open ? "Hide the rows" : "Show the rows"}
      </Button>
      {open ? (
        <div id={regionId} style={{ width: "100%", overflowX: "auto" }}>
          {rows.error ? (
            <p role="alert" style={{ color: "var(--color-danger)", fontSize: "var(--text-13)", margin: 0 }}>
              {getApiErrorMessage(rows.error)}
            </p>
          ) : rows.data ? (
            rows.data.rows.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No rows now: what stopped Vane may have been fixed.
              </p>
            ) : (
              <table className="table" style={{ fontSize: "var(--text-13)" }}>
                <thead>
                  <tr>
                    {rows.data.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.data.rows.map((row, index) => (
                    <tr key={index}>
                      {rows.data!.columns.map((column) => (
                        <td key={column} className={typeof row[column] === "number" ? "num" : undefined}>
                          {cell(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : null}
          {rows.data?.more ? <p className="muted" style={{ margin: "var(--space-8) 0 0" }}>The first {rows.data.rows.length} rows.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
