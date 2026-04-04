"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OperationManifest } from "@/components/admin-portal/types";
import { OperationWizardDialog } from "@/components/admin-portal/wizards/operation-wizard-dialog";

type Row = { module: string; action: string };

export function OperationsTable({
  title,
  actorEmail,
  manifest,
  companyId,
  modules,
}: {
  title: string;
  actorEmail: string;
  manifest: OperationManifest;
  companyId?: string;
  modules?: string[];
}) {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row | null>(null);

  const rows = useMemo(() => {
    const all = Object.entries(manifest)
      .filter(([module]) => (modules ? modules.includes(module) : true))
      .flatMap(([module, actions]) => actions.map((action) => ({ module, action })));

    const q = search.trim().toLowerCase();
    return all.filter((row) => {
      const matchesModule = moduleFilter === "all" || row.module === moduleFilter;
      const matchesSearch = !q || row.module.includes(q) || row.action.toLowerCase().includes(q);
      return matchesModule && matchesSearch;
    });
  }, [manifest, modules, search, moduleFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const paged = rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <section className="admin-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--edge-subtle)] px-5 py-4">
        <div>
          <p className="admin-page-kicker">Operations</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text-strong)]">{title}</h2>
        </div>
        <Badge variant="outline" className="rounded-full px-3 py-1 font-mono">{rows.length} actions</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--edge-subtle)] px-5 py-3">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search actions"
          className="h-9 flex-1 md:min-w-[220px]"
        />
        <Button className="h-9" onClick={() => setPage(1)}>Search</Button>

        <Select value={moduleFilter} onValueChange={(value) => {
          setModuleFilter(value);
          setPage(1);
        }}>
          <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {Object.keys(manifest)
              .filter((module) => (modules ? modules.includes(module) : true))
              .map((module) => (
                <SelectItem key={module} value={module}>{module}</SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={String(rowsPerPage)} onValueChange={(value) => {
          setRowsPerPage(Number(value));
          setPage(1);
        }}>
          <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="12">12/page</SelectItem>
            <SelectItem value="24">24/page</SelectItem>
            <SelectItem value="48">48/page</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="h-9" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
        <Badge variant="outline" className="h-9 rounded-[10px] px-3 font-mono">{currentPage}/{totalPages}</Badge>
        <Button variant="outline" className="h-9" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
      </div>

      <div className="overflow-x-auto">
        <table className="admin-reference-table w-full min-w-[720px] text-sm">
          <thead className="text-left text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3 text-right">Run</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => (
              <tr key={`${row.module}.${row.action}`}>
                <td className="px-4 py-3 font-mono text-[13px] text-[var(--text-muted)]">{row.module}</td>
                <td className="px-4 py-3 font-medium text-[var(--text-strong)]">{row.action}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" onClick={() => setSelected(row)}>Open wizard</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <OperationWizardDialog
        open={Boolean(selected)}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
        module={selected?.module ?? ""}
        action={selected?.action ?? ""}
        actorEmail={actorEmail}
        companyId={companyId}
      />
    </section>
  );
}
