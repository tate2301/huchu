"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import { FilterBar, FilterSelect } from "../../common/filter-select";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
} from "../../common/states";
import { ExternalLink } from "@corelithzw/ui/lib/icons";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  linkUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  isShared: boolean;
  createdAt: string;
  subject: { id: string; code: string; name: string } | null;
  class: { id: string; name: string } | null;
  uploadedBy: { id: string; user: { name: string | null } | null } | null;
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * What kind of thing this is, said in one word.
 *
 * Read from the media type where the school recorded one and from the address
 * otherwise, because a link to a shared drive carries its type in its tail and
 * nowhere else. "Link" is the honest answer when neither says.
 */
const KINDS: Array<[RegExp, string]> = [
  [/pdf/, "PDF"],
  [/word|msword|\.docx?(\?|$)/, "Document"],
  [/presentation|powerpoint|\.pptx?(\?|$)/, "Slides"],
  [/sheet|excel|\.xlsx?(\?|$)|\.csv(\?|$)/, "Spreadsheet"],
  [/^video|\.mp4(\?|$)|youtu/, "Video"],
  [/^image|\.(png|jpe?g|gif|webp)(\?|$)/, "Image"],
];

function kindOf(resource: Resource) {
  const subject = `${resource.mimeType ?? ""} ${resource.fileUrl ?? ""} ${
    resource.linkUrl ?? ""
  }`.toLowerCase();
  return KINDS.find(([pattern]) => pattern.test(subject))?.[1] ?? "Link";
}

/** Bytes as a school would say them. Nothing carries a size until uploads land. */
function sizeOf(bytes: number | null) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The department's shelf.
 *
 * Resources hang off a subject rather than off a class: a Form 2 worksheet is
 * the same worksheet next September, and pinning it to 2A means re-uploading
 * it every year. The year group is a hint, which is why both filters are
 * dropdowns that default to everything rather than a navigation the teacher
 * has to walk down.
 *
 * A grid rather than rows, following the demo and the library rule — a
 * resource is recognised by its name and its kind at a glance, and twenty of
 * them as text rows read as a spreadsheet nobody scans.
 *
 * Filtering happens here rather than on the server. The shelf is a few hundred
 * rows and the endpoint's own search matches the title only, so a teacher
 * looking for "the thing Mrs Moyo put up" would find nothing. The trade is
 * honest: at 300 resources the list is truncated by the API, and the filters
 * then describe what arrived rather than what exists.
 */
export function TeacherFilesScreen() {
  const queryClient = useQueryClient();
  const { day: portalDay, error: portalError } = useTeacherPortal();

  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    linkUrl: "",
    description: "",
    subjectId: "",
    classId: "",
    isShared: "shared",
  });

  const list = useQuery({
    queryKey: ["schools", "portal", "teacher", "resources"],
    queryFn: () =>
      fetchJson<{ resources: Resource[] }>("/api/v2/schools/teaching-resources"),
  });

  const resources = list.data?.resources ?? [];

  // Both option lists are drawn from the shelf itself, so every choice has
  // something behind it — a filter that can only return nothing is worse than
  // no filter.
  const subjects = [
    ...new Map(
      resources
        .filter((row) => row.subject)
        .map((row) => [row.subject!.id, row.subject!]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const yearGroups = [
    ...new Map(
      resources.filter((row) => row.class).map((row) => [row.class!.id, row.class!]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const needle = search.trim().toLowerCase();
  const shown = resources.filter((row) => {
    if (subjectFilter && row.subject?.id !== subjectFilter) return false;
    if (classFilter && row.class?.id !== classFilter) return false;
    if (!needle) return true;
    return [
      row.title,
      row.description ?? "",
      row.subject?.name ?? "",
      row.class?.name ?? "",
      row.uploadedBy?.user?.name ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const mySubjects = [
    ...new Map(
      portalDay.classes.map((row) => [row.subjectId, { id: row.subjectId, name: row.subjectName }]),
    ).values(),
  ];
  const myClasses = [
    ...new Map(
      portalDay.classes.map((row) => [row.classId, { id: row.classId, name: row.className }]),
    ).values(),
  ];

  const add = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/schools/portal/teacher/me/resources", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title.trim(),
          linkUrl: draft.linkUrl.trim(),
          description: draft.description.trim() || null,
          subjectId: draft.subjectId || null,
          classId: draft.classId || null,
          isShared: draft.isShared === "shared",
        }),
      }),
    onSuccess: () => {
      setFormOpen(false);
      setSaved(
        draft.isShared === "shared"
          ? `"${draft.title.trim()}" is on the shelf`
          : `"${draft.title.trim()}" saved — only you can see it`,
      );
      setDraft({
        title: "",
        linkUrl: "",
        description: "",
        subjectId: "",
        classId: "",
        isShared: "shared",
      });
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "teacher", "resources"],
      });
    },
  });

  if (portalError) {
    return <LoadError what="your classes" error={portalError} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {list.error ? (
        <LoadError
          what="the shelf"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : null}
      {/* The dialog carries the failure too, but it closes on success and a
          teacher who dismissed it still deserves to know nothing was added. */}
      {add.error ? <SaveError what="That link" error={add.error} /> : null}
      {saved ? <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[42rem] text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          Worksheets, slides and past papers shared across the department, plus your
          own drafts, which nobody else can see. Files themselves land with the
          documents work in a later release — for now a resource is a link to wherever
          the file already lives.
        </p>
        <Button
          variant="primary"
          onClick={() => {
            add.reset();
            setFormOpen(true);
          }}
        >
          Add a link
        </Button>
      </div>

      <FilterBar>
        <div className="min-w-0 flex-1 basis-[220px] sm:max-w-[280px]">
          <Label
            htmlFor="resource-search"
            className="text-sm text-muted-foreground"
          >
            Search
          </Label>
          <Input
            id="resource-search"
            value={search}
            placeholder="Name, subject or who added it"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <FilterSelect
          label="Subject"
          value={subjectFilter}
          allLabel="All subjects"
          onChange={setSubjectFilter}
          options={subjects.map((row) => ({ value: row.id, label: row.name }))}
        />
        <FilterSelect
          label="Year group"
          value={classFilter}
          allLabel="All year groups"
          onChange={setClassFilter}
          options={yearGroups.map((row) => ({ value: row.id, label: row.name }))}
        />
      </FilterBar>

      {list.isPending ? (
        /* Cards, not rows: the shelf below is a grid, and a table skeleton
           would reflow into a grid the moment the data landed. */
        <CardsSkeleton count={6} columns={3} lines={2} />
      ) : resources.length === 0 ? (
        <NothingYet
          title="The shelf is empty"
          body="Nothing has been shared with the department yet. Add a link to a worksheet or a past paper and everyone teaching the subject has it."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                add.reset();
                setFormOpen(true);
              }}
            >
              Add a link
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <NothingMatched
          what="resources"
          filters={[
            subjectFilter ? subjects.find((row) => row.id === subjectFilter)?.name : null,
            classFilter ? yearGroups.find((row) => row.id === classFilter)?.name : null,
            search.trim() || null,
          ].filter((value): value is string => Boolean(value))}
          onClear={() => {
            setSearch("");
            setSubjectFilter("");
            setClassFilter("");
          }}
        />
      ) : (
        <>
          <p
            aria-live="polite"
            className="text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]"
          >
            {shown.length} of {resources.length} resource
            {resources.length === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
            {shown.map((row) => {
              const href = row.linkUrl ?? row.fileUrl;
              const size = sizeOf(row.fileSize);
              const uploader = row.uploadedBy?.user?.name ?? null;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{kindOf(row)}</Badge>
                    {row.subject ? (
                      <Badge tone="outline">{row.subject.name}</Badge>
                    ) : null}
                    {row.isShared ? null : (
                      <Badge tone="warn" dot>
                        Draft — only you
                      </Badge>
                    )}
                  </div>

                  <h3 className="text-[length:var(--type-body)] font-semibold text-[color:var(--text-strong)]">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-start gap-1 text-[color:var(--text-strong)] no-underline hover:text-[color:var(--text-link)]"
                      >
                        <span>{row.title}</span>
                        <ExternalLink className="mt-1 size-3.5 shrink-0" aria-hidden />
                        <span className="sr-only">opens in a new tab</span>
                      </a>
                    ) : (
                      row.title
                    )}
                  </h3>

                  {row.description ? (
                    <p className="line-clamp-3 text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                      {row.description}
                    </p>
                  ) : null}

                  <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                    {row.class ? row.class.name : "Any year group"}
                    {size ? ` · ${size}` : ""}
                  </p>

                  <div className="mt-auto flex items-center gap-2 pt-2">
                    {uploader ? <PersonAvatar name={uploader} size="xs" /> : null}
                    <span className="min-w-0 flex-1 truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {uploader ?? "The school"}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-subtle)]">
                      {DAY.format(new Date(row.createdAt))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <RecordDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Add a link"
        description="Point the department at a worksheet, a past paper or a video."
        size="md"
        errors={add.error ? [getApiErrorMessage(add.error)] : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={add.isPending}
              disabled={!draft.title.trim() || !draft.linkUrl.trim()}
              onClick={() => add.mutate()}
            >
              Add it
            </Button>
          </>
        }
      >
        <Alert tone="info" title="Links only for now">
          Uploading the file itself arrives with the documents work in a later
          release. Until then, paste the address of somewhere the file already
          lives — a shared drive, the school server, a website.
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-title">Name</Label>
            <Input
              id="resource-title"
              value={draft.title}
              maxLength={300}
              placeholder="Word problems · Set B"
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-link">Address</Label>
            <Input
              id="resource-link"
              type="url"
              value={draft.linkUrl}
              placeholder="https://"
              onChange={(event) =>
                setDraft((current) => ({ ...current, linkUrl: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="resource-subject">Subject</Label>
            <Select
              value={draft.subjectId || "__any__"}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  subjectId: value === "__any__" ? "" : value,
                }))
              }
            >
              <SelectTrigger id="resource-subject" className="w-full">
                <SelectValue placeholder="Any subject" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any subject</SelectItem>
                {mySubjects.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="resource-class">Year group</Label>
            <Select
              value={draft.classId || "__any__"}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  classId: value === "__any__" ? "" : value,
                }))
              }
            >
              <SelectTrigger id="resource-class" className="w-full">
                <SelectValue placeholder="Any year group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any year group</SelectItem>
                {myClasses.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              A hint, not a rule. The same worksheet suits next year&apos;s Form 2.
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-description">What it is</Label>
            <Textarea
              id="resource-description"
              rows={3}
              value={draft.description}
              placeholder="Anything a colleague needs to know before they open it."
              onChange={(event) =>
                setDraft((current) => ({ ...current, description: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="resource-shared">Who can see it</Label>
            <Select
              value={draft.isShared}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, isShared: value }))
              }
            >
              <SelectTrigger id="resource-shared" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shared">Everyone in the department</SelectItem>
                <SelectItem value="mine">Only me, for now</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </RecordDialog>
    </div>
  );
}
