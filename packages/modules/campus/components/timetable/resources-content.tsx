"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Checkbox } from "@corelithzw/ui/components/checkbox";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { FilterBar, FilterSelect } from "../common/filter-select";
import { RecordActions } from "../common/record-actions";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
} from "../common/states";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsSubjects } from "../../admin-v2";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  linkUrl: string | null;
  isShared: boolean;
  subject: { id: string; code: string; name: string } | null;
  class: { id: string; name: string } | null;
  uploadedBy: { id: string; user: { name: string | null } } | null;
};

/**
 * The staff-room shelf.
 *
 * Resources hang off a *subject*, not a class: a Form 2 worksheet is the same
 * worksheet next September, and pinning it to a class means re-uploading it
 * every year. The year group is a hint, not the key.
 *
 * A teacher's own unshared drafts are visible to them and to nobody else, which
 * is what makes it safe to put a half-finished worksheet here rather than on a
 * memory stick.
 */
export function TeachingResourcesContent() {
  const queryClient = useQueryClient();
  const [subjectFilter, setSubjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  /** The resource the form is amending. Null means it is adding a new one. */
  const [editing, setEditing] = useState<Resource | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    subjectId: "",
    linkUrl: "",
    isShared: true,
  });

  const subjectsQuery = useQuery({
    queryKey: ["schools", "academics", "subjects", "all"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const resourcesQuery = useQuery({
    queryKey: ["schools", "resources", subjectFilter, search],
    queryFn: () =>
      fetchJson<{ resources: Resource[] }>(
        `/api/v2/schools/teaching-resources?${new URLSearchParams({
          ...(subjectFilter ? { subjectId: subjectFilter } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
        }).toString()}`,
      ),
  });

  const subjects = useMemo(
    () => subjectsQuery.data?.data ?? [],
    [subjectsQuery.data],
  );
  const resources = useMemo(
    () => resourcesQuery.data?.resources ?? [],
    [resourcesQuery.data],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Resource[]>();
    for (const resource of resources) {
      const key = resource.subject?.name ?? "Anything";
      const bucket = map.get(key);
      if (bucket) bucket.push(resource);
      else map.set(key, [resource]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [resources]);

  /**
   * One mutation for both verbs.
   *
   * Adding and amending write the same five fields to the same shape, so a
   * second mutation would only be a second place for the two forms to drift
   * apart. `editing` decides the method and the URL and nothing else.
   */
  const saveMutation = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        subjectId: draft.subjectId || null,
        linkUrl: draft.linkUrl.trim() || null,
        isShared: draft.isShared,
      });
      return editing
        ? fetchJson(`/api/v2/schools/teaching-resources/${editing.id}`, {
            method: "PATCH",
            body,
          })
        : fetchJson("/api/v2/schools/teaching-resources", { method: "POST", body });
    },
    onSuccess: () => {
      setFormOpen(false);
      setEditing(null);
      setDraft({
        title: "",
        description: "",
        subjectId: "",
        linkUrl: "",
        isShared: true,
      });
      void queryClient.invalidateQueries({ queryKey: ["schools", "resources"] });
    },
  });

  /**
   * Taking something off the shelf.
   *
   * A dead link left sitting there looks usable, and a staff room that opens
   * two broken worksheets stops trusting the shelf and goes back to memory
   * sticks. Nothing is written against a resource, so this is a real delete.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/teaching-resources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "resources"] });
    },
  });

  function openBlank() {
    setEditing(null);
    setDraft({
      title: "",
      description: "",
      subjectId: "",
      linkUrl: "",
      isShared: true,
    });
    saveMutation.reset();
    setFormOpen(true);
  }

  function openFor(resource: Resource) {
    setEditing(resource);
    setDraft({
      title: resource.title,
      description: resource.description ?? "",
      subjectId: resource.subject?.id ?? "",
      // A file-backed resource has no link to edit; the box stays empty and
      // the PATCH route keeps the file it already has.
      linkUrl: resource.linkUrl ?? "",
      isShared: resource.isShared,
    });
    saveMutation.reset();
    setFormOpen(true);
  }

  const anyFilter = Boolean(subjectFilter || search.trim());
  const narrowed = [
    subjects.find((subject) => subject.id === subjectFilter)?.name,
    search.trim() || null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-4">
      {resourcesQuery.error ? (
        <LoadError
          what="the staff-room shelf"
          error={resourcesQuery.error}
          onRetry={() => void resourcesQuery.refetch()}
        />
      ) : null}
      {subjectsQuery.error ? (
        // Scoped to the subject filter, not the page: the shelf below still
        // reads fine, it just cannot be narrowed by subject until this lands.
        <LoadError
          what="the subject list"
          error={subjectsQuery.error}
          onRetry={() => void subjectsQuery.refetch()}
        />
      ) : null}
      {deleteMutation.error ? (
        <SaveError what="The resource" error={deleteMutation.error} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FilterBar>
          <div className="min-w-0 flex-1 basis-[200px] sm:max-w-[280px]">
            <Label htmlFor="resource-search" className="text-sm text-muted-foreground">
              Find
            </Label>
            <Input
              id="resource-search"
              value={search}
              placeholder="Worksheet, past paper…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <FilterSelect
            label="Subject"
            allLabel="Every subject"
            value={subjectFilter}
            options={subjects.map((subject) => ({
              value: subject.id,
              label: subject.name,
            }))}
            onChange={setSubjectFilter}
          />
        </FilterBar>
        <Button onClick={openBlank}>Add a resource</Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {resources.length} resource{resources.length === 1 ? "" : "s"} on the shelf.
      </p>

      {resourcesQuery.isPending ? (
        // The shelf is a grid of cards, so it gets card placeholders. Table
        // rows here would be the wrong shape twice over.
        <CardsSkeleton count={6} columns={2} lines={2} />
      ) : grouped.length === 0 ? (
        anyFilter ? (
          <NothingMatched
            what="resources"
            filters={narrowed}
            onClear={() => {
              setSubjectFilter("");
              setSearch("");
            }}
          />
        ) : (
          <NothingYet
            title="Nothing on the shelf yet"
            body="A worksheet, a past paper, a link to a video. Put one up and every teacher in the school can pick it up next term."
            action={<Button onClick={openBlank}>Add a resource</Button>}
          />
        )
      ) : (
        <MobileList>
          {grouped.map(([subject, rows]) => (
            <div key={subject}>
              <MobileListSectionHeader>{subject}</MobileListSectionHeader>
              {rows.map((resource) => (
                <MobileList.Row
                  key={resource.id}
                  static
                  title={resource.title}
                  trailing={
                    <RecordActions
                      resource="schools.academics"
                      verbs={[
                        {
                          label: "Edit",
                          action: "edit",
                          onSelect: () => openFor(resource),
                        },
                        {
                          label: "Take it off",
                          action: "archive",
                          tone: "danger",
                          loading:
                            deleteMutation.isPending &&
                            deleteMutation.variables === resource.id,
                          onSelect: () => deleteMutation.mutate(resource.id),
                          confirm: {
                            title: `Take “${resource.title}” off the shelf?`,
                            description:
                              "It goes for everybody who can see the shelf. Nothing else in the school points at a resource, so this cannot be undone.",
                            confirmLabel: "Take it off",
                          },
                        },
                      ]}
                    />
                  }
                  subtitle={
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      <span>
                        {resource.description ?? "No description"}
                        {resource.uploadedBy?.user.name
                          ? ` · ${resource.uploadedBy.user.name}`
                          : ""}
                      </span>
                      {resource.isShared ? (
                        <Badge variant="secondary">Shared</Badge>
                      ) : (
                        <Badge variant="outline">Only you</Badge>
                      )}
                      {resource.linkUrl || resource.fileUrl ? (
                        <a
                          className="text-sm underline"
                          href={(resource.fileUrl ?? resource.linkUrl) as string}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : null}
                    </span>
                  }
                />
              ))}
            </div>
          ))}
        </MobileList>
      )}

      <RecordDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add a resource"
        size="md"
        errors={
          saveMutation.error ? [getApiErrorMessage(saveMutation.error)] : undefined
        }
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.title.trim() && draft.linkUrl.trim() && !saveMutation.isPending) {
            saveMutation.mutate();
          }
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                !draft.title.trim() || !draft.linkUrl.trim() || saveMutation.isPending
              }
            >
              {saveMutation.isPending ? "Saving…" : "Add it"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-title">What is it</Label>
            <Input
              id="resource-title"
              value={draft.title}
              maxLength={300}
              placeholder="Simultaneous equations worksheet"
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-link">Link</Label>
            <Input
              id="resource-link"
              value={draft.linkUrl}
              placeholder="https://…"
              onChange={(event) =>
                setDraft((current) => ({ ...current, linkUrl: event.target.value }))
              }
            />
            <p className="text-sm text-muted-foreground">
              File upload comes with the documents work in Iteration 5. A link is
              what the shelf holds until then.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-subject">Subject</Label>
            <FilterSelect
              label=""
              allLabel="Any subject"
              value={draft.subjectId}
              options={subjects.map((subject) => ({
                value: subject.id,
                label: subject.name,
              }))}
              onChange={(value) =>
                setDraft((current) => ({ ...current, subjectId: value }))
              }
              className="min-w-0"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-description">Notes</Label>
            <Textarea
              id="resource-description"
              rows={2}
              value={draft.description}
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="flex items-start gap-2">
              <Checkbox
                checked={draft.isShared}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, isShared: checked === true }))
                }
              />
              <span>
                Share it with the other teachers
                <span className="block text-muted-foreground">
                  Leave it off for a draft. Only you will see it.
                </span>
              </span>
            </Label>
          </div>
        </div>
      </RecordDialog>
    </div>
  );
}
