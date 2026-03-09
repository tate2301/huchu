"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OperationManifest } from "@/components/admin-portal/types";
import { OperationWizardDialog } from "@/components/admin-portal/wizards/operation-wizard-dialog";
import { ChevronDown } from "@/lib/icons";

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
  const [operationPickerOpen, setOperationPickerOpen] = useState(false);
  const [operationQuery, setOperationQuery] = useState("");

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
  const operationPickerRows = useMemo(() => {
    const q = operationQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => `${row.module}.${row.action}`.toLowerCase().includes(q));
  }, [rows, operationQuery]);

  return (
    <section className="space-y-3 rounded-xl border bg-[var(--surface-base)] p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{title}</h1>
        <Badge variant="outline" className="font-mono">{rows.length} actions</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search actions"
          className="h-9 flex-1"
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

        <Popover
          open={operationPickerOpen}
          onOpenChange={(value) => {
            setOperationPickerOpen(value);
            if (!value) setOperationQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 min-w-[220px] justify-between">
              Jump to operation
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                value={operationQuery}
                onValueChange={setOperationQuery}
                placeholder="Search module.action"
              />
              <CommandList>
                {operationPickerRows.length === 0 ? (
                  <CommandEmpty>No matching operation.</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {operationPickerRows.slice(0, 60).map((row) => {
                      const key = `${row.module}.${row.action}`;
                      return (
                        <CommandItem
                          key={key}
                          value={key}
                          onMouseDown={(event) => event.preventDefault()}
                          onSelect={() => {
                            setSearch(key);
                            setModuleFilter(row.module);
                            setPage(1);
                            setOperationPickerOpen(false);
                            setOperationQuery("");
                          }}
                        >
                          <span className="font-mono text-xs">{key}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

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
        <Badge variant="outline" className="h-9 rounded-md px-3 font-mono">{currentPage}/{totalPages}</Badge>
        <Button variant="outline" className="h-9" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Module</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Run</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row) => (
              <tr key={`${row.module}.${row.action}`} className="border-t">
                <td className="px-3 py-2 font-mono">{row.module}</td>
                <td className="px-3 py-2">{row.action}</td>
                <td className="px-3 py-2">
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
