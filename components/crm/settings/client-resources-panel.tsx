"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, Button, Input, SegmentedControl, Switch, TextArea, toast } from "@corelithzw/react";
import { ReportTable, dim, node, num, txt, type ReportRow } from "@/components/accounting/report-table";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Archive, FileText, Globe, Info, RotateCcw, Upload } from "@/lib/icons";
import {
  RESOURCES_QUERY_KEY,
  fetchResourceLibrary,
  titleFromFileName,
  uploadResourceFile,
  type LibraryResourceRecord,
} from "@/lib/crm/resources-client";

import { SetupNote, SetupPanel } from "./setup-chrome";

type Draft = {
  kind: "LINK" | "FILE";
  title: string;
  description: string;
  url: string;
  file: File | null;
  isDefault: boolean;
};

const EMPTY_DRAFT: Draft = { kind: "LINK", title: "", description: "", url: "", file: null, isDefault: false };

function ResourceName({ resource }: { resource: LibraryResourceRecord }) {
  const Icon = resource.kind === "FILE" ? FileText : Globe;
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />
      <span className="min-w-0">
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-semibold text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2"
        >
          {resource.title}
        </a>
        {resource.description ? (
          <span className="block truncate text-sm text-[var(--text-muted)]">{resource.description}</span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * What the client is asked to look at alongside a quote or an invoice.
 *
 * The brochure, the data sheet, the guarantee — each is a link to somewhere
 * already public or a file uploaded here. The ones marked "on every document"
 * come ticked in the quote builder; the rest are one tick away.
 *
 * Nothing is deleted. A resource a client has been sent is part of what they
 * were sent, and the link in their inbox has to keep working, so retiring one
 * is archiving: it leaves the builder and stays on every document that
 * offered it.
 */
export function ClientResourcesPanel({
  createOpen,
  onCreateOpenChange,
}: {
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<string[]>([]);

  const library = useQuery({
    queryKey: [...RESOURCES_QUERY_KEY, "with-archived"],
    queryFn: () => fetchResourceLibrary({ withArchived: true }),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: RESOURCES_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["crm-setup-counts"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      if (draft.kind === "FILE") {
        if (!draft.file) throw new Error("Choose the file to upload");
        return uploadResourceFile(draft.file, {
          title: draft.title,
          description: draft.description.trim() || null,
          isDefault: draft.isDefault,
        });
      }
      return fetchJson("/api/v2/crm/resources", {
        method: "POST",
        body: JSON.stringify({
          kind: "LINK",
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          url: draft.url.trim(),
          isDefault: draft.isDefault,
        }),
      });
    },
    onSuccess: () => {
      toast.success(`${draft.title.trim() || "The file"} added to the library`);
      setDraft(EMPTY_DRAFT);
      setErrors([]);
      onCreateOpenChange(false);
      refresh();
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; isDefault?: boolean; archived?: boolean }) =>
      fetchJson(`/api/v2/crm/resources/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: input.isDefault, archived: input.archived }),
      }),
    onSuccess: refresh,
    onError: (error) =>
      toast.error("That change was not saved", { description: getApiErrorMessage(error) }),
  });

  if (library.isLoading) return <Skeleton className="h-64 w-full" />;

  if (library.error || !library.data) {
    return (
      <Alert tone="danger" title="The client resources would not load">
        {getApiErrorMessage(library.error)}
      </Alert>
    );
  }

  const canEdit = library.data.canEdit;
  const live = library.data.data.filter((resource) => !resource.archivedAt);
  const archived = library.data.data.filter((resource) => resource.archivedAt);

  const liveRows: ReportRow[] = live.map((resource) => ({
    id: resource.id,
    cells: [
      node(<ResourceName resource={resource} />),
      txt(resource.kind === "FILE" ? "File" : "Link", { tone: "subtle" }),
      // Never offered is "nothing yet", not a count of zero.
      resource.documentCount > 0 ? num(String(resource.documentCount)) : dim(),
      node(
        <Switch
          checked={resource.isDefault}
          disabled={!canEdit || update.isPending}
          onChange={(event) => update.mutate({ id: resource.id, isDefault: event.target.checked })}
          aria-label={`Tick ${resource.title} on every new document`}
        />,
      ),
      node(
        canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            disabled={update.isPending}
            onClick={() => update.mutate({ id: resource.id, archived: true })}
            aria-label={`Archive ${resource.title}`}
          >
            <Archive aria-hidden="true" className="size-4" />
          </Button>
        ) : null,
        { align: "right" },
      ),
    ],
  }));

  const archivedRows: ReportRow[] = archived.map((resource) => ({
    id: resource.id,
    cells: [
      node(<ResourceName resource={resource} />),
      resource.documentCount > 0 ? num(String(resource.documentCount)) : dim(),
      node(
        canEdit ? (
          <Button
            size="sm"
            variant="secondary"
            startIcon={<RotateCcw aria-hidden="true" className="size-3.5" />}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: resource.id, archived: false })}
          >
            Restore
          </Button>
        ) : null,
        { align: "right" },
      ),
    ],
  }));

  const validate = (): string[] => {
    const found: string[] = [];
    if (draft.kind === "LINK") {
      if (!draft.title.trim()) found.push("Give the link a title the client will recognise.");
      if (!/^https?:\/\/\S+$/i.test(draft.url.trim())) {
        found.push("The address has to start with http:// or https://.");
      }
    } else if (!draft.file) {
      found.push("Choose the file to upload.");
    }
    return found;
  };

  return (
    <div className="min-w-0 space-y-3">
      {!canEdit ? (
        <Alert tone="info" title="The library is not yours to change">
          Anybody raising a quote can use it, and add a file from the quote itself. Changing what is
          in it is for somebody with CRM settings access.
        </Alert>
      ) : null}

      <SetupPanel title="Library" hint="switched on comes ticked on every new quote and invoice" flush>
        <ReportTable
          label="Client resources"
          tracks="minmax(0,1fr) 70px 90px 140px 52px"
          columns={[
            { label: "Resource" },
            { label: "Kind" },
            { label: "Offered on", align: "right" },
            { label: "On every document" },
            { label: "", align: "right" },
          ]}
          rows={liveRows}
          emptyLabel="Nothing in the library yet. Add the brochure or the terms you send with every quote, and they come ticked from then on."
        />
      </SetupPanel>

      {archivedRows.length > 0 ? (
        <SetupPanel title="Archived" hint="off new documents; still on the ones that offered them" flush>
          <ReportTable
            label="Archived client resources"
            tracks="minmax(0,1fr) 90px 110px"
            columns={[{ label: "Resource" }, { label: "Offered on", align: "right" }, { label: "", align: "right" }]}
            rows={archivedRows}
          />
        </SetupPanel>
      ) : null}

      <SetupNote icon={Info}>
        The approval page, the covering email and the PDF all list what a document offered. Archiving
        a resource takes it off new documents only — a client who was sent it keeps a working link.
      </SetupNote>

      <RecordDialog
        open={createOpen}
        onOpenChange={(next) => {
          if (!next) {
            setDraft(EMPTY_DRAFT);
            setErrors([]);
          }
          onCreateOpenChange(next);
        }}
        title="Add a client resource"
        description="A link or a file the client can open alongside a quote or an invoice."
        errors={errors}
        onSubmit={(event) => {
          event.preventDefault();
          const found = validate();
          setErrors(found);
          if (found.length === 0) create.mutate();
        }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => onCreateOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              Add to the library
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <SegmentedControl
            aria-label="What kind of resource"
            options={[
              { value: "LINK", label: "A link", icon: <Globe aria-hidden="true" className="size-4" /> },
              { value: "FILE", label: "A file", icon: <Upload aria-hidden="true" className="size-4" /> },
            ]}
            value={draft.kind}
            onValueChange={(kind) => setDraft((current) => ({ ...current, kind }))}
          />

          {draft.kind === "LINK" ? (
            <Input
              label="Address"
              type="url"
              inputMode="url"
              value={draft.url}
              onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
              placeholder="https://"
              maxLength={2000}
              autoFocus
            />
          ) : (
            <div className="space-y-1.5">
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setDraft((current) => ({
                    ...current,
                    file,
                    title: current.title || (file ? titleFromFileName(file.name) : ""),
                  }));
                }}
              />
              <Button
                type="button"
                variant="secondary"
                startIcon={<Upload aria-hidden="true" className="size-4" />}
                onClick={() => fileInput.current?.click()}
              >
                {draft.file ? "Choose a different file" : "Choose a file"}
              </Button>
              <p className="text-sm text-[var(--text-muted)]">
                {draft.file ? draft.file.name : "A PDF or an image, up to 10MB."}
              </p>
            </div>
          )}

          <Input
            label="Title"
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            placeholder="Floorcode brochure"
            hint="What the client sees as the link."
            maxLength={160}
          />
          <TextArea
            label="Why open it (optional)"
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            placeholder="Finishes, colours and where they have been laid"
            rows={2}
            maxLength={300}
          />
          <Switch
            label="Tick it on every new quote and invoice"
            checked={draft.isDefault}
            onChange={(event) => setDraft((current) => ({ ...current, isDefault: event.target.checked }))}
          />
        </div>
      </RecordDialog>
    </div>
  );
}
