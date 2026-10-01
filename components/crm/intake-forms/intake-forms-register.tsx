"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  HeaderAction,
  ListColumn,
  ListRow,
  RecordHeader,
  RecordList,
  RegisterLayout,
  SectionHeading,
  StatusBadge,
  type ListColumnState,
  type RecordListRow,
} from "@/components/management/ui";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  BackToList,
  RecordEmpty,
} from "@/app/management/master-data/schools/classes/record-fields";
import {
  CreateDialog,
  CreateField,
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
  NoRecord,
} from "@/app/management/master-data/operations/_components/register-fields";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { FieldDefinition } from "@/lib/forms/fields";
import { CopyLink, NoteAdd, SlidersHorizontal, Tray } from "@/lib/icons";

import { IntakeFormContentSections, type ServiceDraft } from "./intake-form-content";

type IntakeForm = {
  id: string;
  name: string;
  headline: string | null;
  description: string | null;
  successMessage: string | null;
  publicToken: string;
  isActive: boolean;
  allowPhotos: boolean;
  maxPhotos: number;
  fields: FieldDefinition[] | null;
  services: ServiceDraft[] | null;
  submissionCount: number;
  convertedCount: number;
  lastSubmissionAt: string | null;
};

type Submission = {
  id: string;
  createdAt: string;
  contactName: string | null;
  lead: { id: string; leadNo: string } | null;
};

const INDEX_HREF = "/crm/forms";
const PHOTO_LIMITS = [1, 3, 5, 10, 20];

function publicPath(form: IntakeForm) {
  return `/f/${form.publicToken}`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Intake forms, as the management surface draws a register: the forms in a
 * list, and the open one beside it as a record.
 *
 * The record carries everything a form is — its name in the header, the few
 * settings that are not words on the form under Details, its words, services
 * and questions, and what it has brought in. The list page of cards and the
 * separate editor page it replaces split those across two screens and hid the
 * settings behind a menu, so a form read as something you could look at but
 * not change.
 *
 * The open form is the route — `/crm/forms/[id]` — so a form can be linked to
 * and the browser's back button moves between them.
 */
export function IntakeFormsRegister({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const formsQuery = useQuery({
    queryKey: ["crm-forms"],
    queryFn: () => fetchJson<{ data: IntakeForm[] }>("/api/v2/crm/intake-forms"),
  });

  const submissionsQuery = useQuery({
    queryKey: ["crm-submissions", "form", selectedId],
    queryFn: () =>
      fetchJson<{ data: Submission[] }>(`/api/v2/crm/submissions?formId=${selectedId}&limit=10`),
    enabled: Boolean(selectedId),
  });

  const forms = useMemo(() => formsQuery.data?.data ?? [], [formsQuery.data]);
  const visible = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return typed ? forms.filter((form) => form.name.toLowerCase().includes(typed)) : forms;
  }, [forms, search]);

  // The list already carries every column of a form, so the record is read
  // from it rather than fetched a second time.
  const record = forms.find((form) => form.id === selectedId) ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["crm-forms"] });
    void queryClient.invalidateQueries({ queryKey: ["crm-intake-forms"] });
  };

  const create = useMutation({
    mutationFn: (name: string) =>
      fetchJson<{ id: string }>("/api/v2/crm/intake-forms", {
        method: "POST",
        body: JSON.stringify({ name, fields: [], services: [] }),
      }),
    onSuccess: (form) => {
      setCreating(false);
      setNewName("");
      invalidate();
      router.push(`${INDEX_HREF}/${form.id}`);
    },
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(`/api/v2/crm/intake-forms/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: invalidate,
    onError: (error) =>
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const copyLink = async (form: IntakeForm) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${publicPath(form)}`);
      toast({ title: "Link copied", description: "Anyone with it can fill the form in." });
    } catch {
      toast({ title: "Couldn't copy the link", variant: "destructive" });
    }
  };

  const state: ListColumnState = formsQuery.isLoading
    ? "loading"
    : formsQuery.isError
      ? "failed"
      : visible.length > 0
        ? "ready"
        : search.trim()
          ? "no-matches"
          : "empty";

  const submissionRows = (submissionsQuery.data?.data ?? []).map(
    (submission): RecordListRow => ({
      id: submission.id,
      name: `${submission.contactName ?? "Someone"} · ${shortDate(submission.createdAt)}`,
      href: submission.lead ? `/crm/leads/${submission.lead.id}` : undefined,
      value: submission.lead
        ? { kind: "text", value: submission.lead.leadNo }
        : { kind: "status", tone: "warn", label: "Not converted" },
    }),
  );

  return (
    <>
      <RegisterLayout
        page
        hasSelection={Boolean(selectedId)}
        collapseList
        list={
          <ListColumn
            title="Intake forms"
            noun="intake form"
            count={formsQuery.isLoading ? undefined : forms.length}
            state={state}
            columns={{ row: "Form", value: "Submissions" }}
            search={{ value: search, onChange: setSearch, placeholder: "Search forms" }}
            onNew={() => setCreating(true)}
            onRetry={() => void formsQuery.refetch()}
            emptyLabel="No intake forms"
            emptyIcon={NoteAdd}
          >
            {visible.map((form) => (
              <ListRow
                key={form.id}
                name={form.name}
                value={form.submissionCount}
                href={`${INDEX_HREF}/${form.id}`}
                selected={form.id === selectedId}
                // A paused form reads muted rather than chipped, the way a
                // retired subject does in its register.
                className={form.isActive ? undefined : "[&_*]:text-[#5E6573]"}
              />
            ))}
          </ListColumn>
        }
      >
        {record ? (
          <>
            <BackToList href={INDEX_HREF} label="Intake forms" />

            <RecordHeader
              title={record.name}
              icon={NoteAdd}
              onRename={(next) => (next.trim() ? patch.mutate({ name: next.trim() }) : undefined)}
              renameLabel="Rename the form"
              badge={
                <StatusBadge context="header" tone={record.isActive ? "success" : "neutral"}>
                  Paused
                </StatusBadge>
              }
              action={
                <HeaderAction icon={CopyLink} onClick={() => void copyLink(record)}>
                  Copy link
                </HeaderAction>
              }
              overflow={
                <DropdownMenuItem onSelect={() => window.open(publicPath(record), "_blank", "noopener")}>
                  Open the public form
                </DropdownMenuItem>
              }
            />

            <SectionHeading icon={SlidersHorizontal} tone="brand">
              Details
            </SectionHeading>
            <DetailGrid className="mb-8">
              <DetailRow label="Status">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={record.isActive ? "live" : "paused"}
                    onValueChange={(next) => patch.mutate({ isActive: next === "live" })}
                  >
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </DetailSelect>
                )}
              </DetailRow>
              <DetailRow label="Photos">
                {(id) => (
                  <DetailSelect
                    id={id}
                    value={record.allowPhotos ? String(record.maxPhotos || 5) : "off"}
                    onValueChange={(next) =>
                      patch.mutate(
                        next === "off"
                          ? { allowPhotos: false }
                          : { allowPhotos: true, maxPhotos: Number(next) },
                      )
                    }
                  >
                    <SelectItem value="off">Not asked for</SelectItem>
                    {PHOTO_LIMITS.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {`Up to ${count}`}
                      </SelectItem>
                    ))}
                  </DetailSelect>
                )}
              </DetailRow>
              <DetailRow label="Public link">
                {(id) => (
                  <Input
                    id={id}
                    readOnly
                    value={publicPath(record)}
                    className={`${DETAIL_CONTROL_CLASS} font-mono`}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                )}
              </DetailRow>
            </DetailGrid>

            <IntakeFormContentSections
              key={record.id}
              formId={record.id}
              name={record.name}
              onSaved={invalidate}
              initial={{
                headline: record.headline,
                description: record.description,
                successMessage: record.successMessage,
                fields: record.fields ?? [],
                services: record.services ?? [],
              }}
            />

            <SectionHeading icon={Tray} count={record.submissionCount}>
              Submissions
            </SectionHeading>
            {submissionsQuery.isLoading ? (
              <RecordEmpty>Loading submissions</RecordEmpty>
            ) : submissionRows.length > 0 ? (
              <RecordList columns={{ row: "Latest", value: "Lead" }} valueWidth={140} rows={submissionRows} />
            ) : (
              <RecordEmpty>Nothing has been submitted yet. Copy the link and put it where clients will find it.</RecordEmpty>
            )}
          </>
        ) : (
          /* Below 900px this column is the whole screen once a form is
             picked, so one still opening — or one that is not there — carries
             the way back to the list with it. */
          <>
            {selectedId ? <BackToList href={INDEX_HREF} label="Intake forms" /> : null}
            <NoRecord
              label={
                selectedId
                  ? formsQuery.isLoading
                    ? "Opening the form"
                    : "That form could not be found."
                  : forms.length > 0
                    ? "Pick a form to see it."
                    : "A form is the cheapest lead source you have — put one on the website and enquiries arrive already in the pipeline."
              }
            />
          </>
        )}
      </RegisterLayout>

      <CreateDialog
        open={creating}
        onOpenChange={(open) => {
          setCreating(open);
          if (!open) create.reset();
        }}
        title="New intake form"
        submitLabel="Create the form"
        busy={create.isPending}
        onSubmit={(event) => {
          event.preventDefault();
          if (newName.trim()) create.mutate(newName.trim());
        }}
      >
        <CreateField label="Name">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={newName}
              placeholder="Website enquiries"
              className="text-[13px]"
              onChange={(event) => setNewName(event.target.value)}
            />
          )}
        </CreateField>
        {create.error ? (
          <p role="alert" className="-mt-3 text-sm text-[#B42318]">
            {getApiErrorMessage(create.error)}
          </p>
        ) : null}
      </CreateDialog>
    </>
  );
}
