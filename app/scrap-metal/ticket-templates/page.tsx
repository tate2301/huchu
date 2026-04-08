"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ScrapShell } from "@/components/scrap-metal/scrap-shell";
import { StatusState } from "@/components/shared/status-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { DEFAULT_TEMPLATE_CATALOG } from "@/lib/documents/default-template-catalog";

type TemplateRow = {
  id: string;
  name: string;
  sourceKey: string;
  scope: "SYSTEM" | "COMPANY";
  isDefault: boolean;
  updatedAt: string;
};

const SCRAP_SOURCE_KEYS = new Set(["scrap-metal.purchase-ticket", "scrap-metal.sale-ticket"]);

export default function ScrapTicketTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ["scrap-ticket-templates"],
    queryFn: async () => {
      const rows = await fetchJson<TemplateRow[]>("/api/document-templates");
      return rows.filter((row) => SCRAP_SOURCE_KEYS.has(row.sourceKey));
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/document-templates/${id}/set-default`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Default template updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-ticket-templates"] });
    },
    onError: (error) => {
      toast({ title: "Unable to set default", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const bootstrapMutation = useMutation({
    mutationFn: async () => {
      for (const entry of DEFAULT_TEMPLATE_CATALOG.filter((item) => SCRAP_SOURCE_KEYS.has(item.sourceKey))) {
        await fetchJson("/api/document-templates", {
          method: "POST",
          body: JSON.stringify({
            name: `${entry.name} (Company)`,
            description: entry.description,
            sourceKey: entry.sourceKey,
            documentType: entry.documentType,
            targetType: entry.targetType,
            cloneFromSystemDefault: true,
            setDefault: false,
          }),
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Company ticket templates created", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["scrap-ticket-templates"] });
    },
    onError: (error) => {
      toast({ title: "Unable to create templates", description: getApiErrorMessage(error), variant: "destructive" });
    },
  });

  const columns = useMemo<ColumnDef<TemplateRow>[]>(() => [
    { id: "name", header: "Template", accessorKey: "name" },
    { id: "source", header: "Source", accessorKey: "sourceKey" },
    {
      id: "scope",
      header: "Scope",
      cell: ({ row }) => <Badge variant={row.original.scope === "COMPANY" ? "default" : "outline"}>{row.original.scope}</Badge>,
    },
    {
      id: "default",
      header: "Default",
      cell: ({ row }) => (row.original.isDefault ? <Badge>Default</Badge> : <span className="text-muted-foreground">No</span>),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/settings/templates">Edit</Link>
          </Button>
          {row.original.scope === "COMPANY" ? (
            <Button size="sm" onClick={() => setDefaultMutation.mutate(row.original.id)} disabled={setDefaultMutation.isPending}>
              Set Default
            </Button>
          ) : null}
        </div>
      ),
    },
  ], [setDefaultMutation]);

  if (templatesQuery.error) {
    return (
      <ScrapShell title="Ticket Templates">
        <StatusState variant="error" title="Unable to load ticket templates" description={getApiErrorMessage(templatesQuery.error)} />
      </ScrapShell>
    );
  }

  return (
    <ScrapShell
      title="Ticket Templates"
      description="Manage brandable templates for inbound and outbound scrap tickets."
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => bootstrapMutation.mutate()} disabled={bootstrapMutation.isPending}>
            {bootstrapMutation.isPending ? "Creating..." : "Create Company Copies"}
          </Button>
          <Button asChild size="sm" variant="outline"><Link href="/settings/templates">Open All Templates</Link></Button>
        </div>
      }
    >
      <DataTable
        data={templatesQuery.data ?? []}
        columns={columns}
        searchPlaceholder="Search ticket templates"
        pagination={{ enabled: true }}
        emptyState={templatesQuery.isLoading ? "Loading templates..." : "No ticket templates found."}
      />
    </ScrapShell>
  );
}
