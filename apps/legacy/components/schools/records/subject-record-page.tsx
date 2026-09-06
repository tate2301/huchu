"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordMark } from "@/components/records/record-mark";
import {
  RailSection,
  RecordPageShell,
  RelatedList,
  type RecordTab,
} from "@/components/records/record-page-shell";
import {
  SubjectFiles,
  SubjectNotes,
  type SubjectFile,
  type SubjectNote,
} from "@/components/records/subject-tabs";
import { useAttributeEditor } from "@/components/records/use-attribute-editor";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  RecordNotFound,
  SaveError,
  StatsSkeleton,
} from "@/components/schools/common/states";
import { ApiError, fetchJson } from "@/lib/api-client";
import { FileText, Percent, Tag, ToggleLeft, Users } from "@corelithzw/ui/lib/icons";
import { recordType } from "@/lib/records/registry";

/**
 * A subject, as a record. The sixth and last type.
 *
 * The only one that had no page at all — the list existed and there was nowhere
 * to go from a row. Its API already had a detail route with a PATCH; what it
 * returned was `_count.classSubjects`, which answers "how many" and is enough for
 * a list. A subject's page is opened to ask **which classes take it and who
 * teaches each**, so the include gained the rows.
 *
 * `passMark` is edited here and it is the one attribute on any of the six record
 * pages that changes what a mark *means*: S-1.3 compares a score against it to
 * decide a pass. Left as a number rather than made a choice because schools
 * genuinely differ — 40 and 50 are both normal here — but it is the field on this
 * page most worth being careful with.
 */

type ClassSubject = {
  id: string;
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
  term: { id: string; code: string; name: string } | null;
  teacherProfile: {
    id: string;
    employeeCode: string;
    user: { id: string; name: string | null; email: string } | null;
  } | null;
};

type SubjectRecord = {
  id: string;
  code: string;
  name: string;
  isCore: boolean;
  passMark: number | null;
  isActive: boolean;
  avatarUrl: string | null;
  emoji: string | null;
  accent: string | null;
  classSubjects: ClassSubject[];
  _count?: { classSubjects?: number };
};

/**
 * Staffing, as a filter on the class list.
 *
 * The rail has always counted the lessons with nobody teaching them and called
 * it "the number somebody is on this page to fix" — and then left them mixed in
 * among the forty that are fine. A subject taken by every form in the school is
 * a list you have to read twice to find the gap in.
 */
const STAFFING_OPTIONS = [
  { value: "unstaffed", label: "Without a teacher" },
  { value: "staffed", label: "With a teacher" },
];

export function SubjectRecordPage({ subjectId }: { subjectId: string }) {
  const config = recordType("SUBJECT");
  const [activeTab, setActiveTab] = useState("classes");
  const [termId, setTermId] = useState("");
  const [staffing, setStaffing] = useState("");

  const query = useQuery({
    queryKey: config.queryKey(subjectId),
    queryFn: () => fetchJson<SubjectRecord>(config.apiPath(subjectId)),
  });

  const edit = useAttributeEditor({
    path: config.apiPath(subjectId),
    invalidate: [config.queryKey(subjectId), ["schools", "subjects"]],
  });

  const notes = useQuery({
    queryKey: ["records", "comments", "SUBJECT", subjectId],
    queryFn: () =>
      fetchJson<{ data: SubjectNote[] }>(
        `/api/v2/records/comments?subjectType=SUBJECT&subjectId=${subjectId}`,
      ),
  });

  const files = useQuery({
    queryKey: ["records", "files", "SUBJECT", subjectId],
    queryFn: () =>
      fetchJson<{ data: SubjectFile[] }>(
        `/api/v2/records/files?subjectType=SUBJECT&subjectId=${subjectId}`,
      ),
  });

  const subject = query.data ?? null;

  const attributes = useMemo<RecordAttribute[]>(() => {
    if (!subject) return [];
    // A mark on every row, and one that means something. The property list
    // falls back to a generic tag for a row that names no icon, so a page that
    // named none at all came out as a column of identical glyphs — which is
    // the ragged column the fallback exists to avoid, drawn the other way up.
    return [
      { id: "name", label: "Name", icon: FileText, ...edit.required("name", subject.name) },
      { id: "code", label: "Code", icon: Tag, mono: true, ...edit.required("code", subject.code) },
      {
        id: "isCore",
        label: "Taken by",
        icon: Users,
        ...edit.choice("isCore", String(subject.isCore), [
          { value: "true", label: "Everybody — core" },
          { value: "false", label: "Optional" },
        ]),
      },
      {
        id: "passMark",
        label: "Pass mark",
        icon: Percent,
        // S-1.3 compares a score against this to decide a pass, so it is the one
        // attribute on any record page that changes what a mark means.
        ...edit.numeric("passMark", subject.passMark),
      },
      {
        id: "isActive",
        label: "Taught",
        icon: ToggleLeft,
        ...edit.choice("isActive", String(subject.isActive), [
          { value: "true", label: "Currently taught" },
          { value: "false", label: "Not taught" },
        ]),
      },
    ];
  }, [subject, edit]);

  if (query.isPending) {
    return (
      // The record's own shape, not two grey slabs. The left column is the mark,
      // the name and the property list; the right is the class list. A
      // placeholder that does not match is why the page used to reflow twice.
      <div
        className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]"
        data-testid="subject-record-loading"
      >
        <div className="space-y-4">
          <CardsSkeleton count={1} columns={1} lines={5} />
          <StatsSkeleton count={3} />
        </div>
        <CardsSkeleton count={6} columns={2} lines={2} />
      </div>
    );
  }

  if (query.isError || !subject) {
    // A subject the ministry retired is a stale link, not a fault; anything
    // else is. "Back to the subjects" and "try again" are different next steps.
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return notFound ? (
      <RecordNotFound
        what="That subject"
        backHref={config.indexHref}
        backLabel="Back to the subjects"
      />
    ) : (
      <LoadError
        what="this subject's record"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const entries = subject.classSubjects ?? [];
  const classes = new Set(entries.map((entry) => entry.class?.id).filter(Boolean));
  const teachers = new Set(entries.map((entry) => entry.teacherProfile?.id).filter(Boolean));
  const unstaffed = entries.filter((entry) => !entry.teacherProfile).length;

  // The terms this subject is actually taught in, rather than the school's whole
  // calendar: a dropdown offering a term with no rows behind it can only ever
  // empty the list.
  const termOptions = [
    ...new Map(
      entries
        .map((entry) => entry.term)
        .filter((term): term is NonNullable<ClassSubject["term"]> => Boolean(term))
        .map((term) => [term.id, { value: term.id, label: term.name }]),
    ).values(),
  ];

  const visible = entries.filter((entry) => {
    if (termId && entry.term?.id !== termId) return false;
    if (staffing === "unstaffed" && entry.teacherProfile) return false;
    if (staffing === "staffed" && !entry.teacherProfile) return false;
    return true;
  });

  const filtersInForce = [
    termId ? termOptions.find((option) => option.value === termId)?.label : null,
    staffing ? STAFFING_OPTIONS.find((option) => option.value === staffing)?.label : null,
  ].filter((value): value is string => Boolean(value));

  const clearFilters = () => {
    setTermId("");
    setStaffing("");
  };

  const tabs: RecordTab[] = [
    {
      value: "classes",
      label: "Classes",
      count: entries.length,
      content: (
        <div className="space-y-3">
          {/* The canvas's line for this card. How many classes take it is what
              a head of department opens a subject to find out, so it is said
              in words above the list rather than left to a tab count. */}
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            {entries.length === 0
              ? "Nothing takes this subject yet."
              : `${classes.size} take this subject${
                  unstaffed > 0 ? ` · ${unstaffed} with no teacher` : ""
                }.`}
          </p>
          <FilterBar>
            <FilterSelect
              label="Term"
              allLabel="Every term"
              value={termId}
              options={termOptions}
              onChange={setTermId}
            />
            <FilterSelect
              label="Teacher"
              allLabel="Staffed or not"
              value={staffing}
              options={STAFFING_OPTIONS}
              onChange={setStaffing}
            />
          </FilterBar>

          {entries.length === 0 ? (
            <NothingYet
              title="No class takes this subject yet"
              body={
                "A subject reaches a pupil through an assignment — who teaches it, " +
                "to which form, in which term. A core one like Mathematics is " +
                "usually taken all the way up the ladder, Form 1 to Upper Sixth; " +
                "an elective may only run in Lower Sixth and Upper Sixth. " +
                "Timetable one and the classes appear here."
              }
            />
          ) : visible.length === 0 ? (
            <NothingMatched what="classes" filters={filtersInForce} onClear={clearFilters} />
          ) : (
            <RelatedList
              items={visible}
              emptyMessage="No class takes this subject yet."
              renderItem={(entry) => ({
                href: entry.class ? recordType("CLASS").href(entry.class.id) : "/schools/classes",
                title: entry.class?.name ?? "Class",
                subtitle: [entry.term?.name, entry.stream?.name].filter(Boolean).join(" · "),
                // A class taking a subject with nobody teaching it is the thing a
                // timetabler is looking for on this page, so it says so rather than
                // showing a blank.
                meta: entry.teacherProfile?.user?.name ?? "No teacher",
              })}
            />
          )}
        </div>
      ),
    },
    {
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      // Scoped to the tab: a Notes read that failed must not take the class list
      // down with it, since that is what the page was opened for.
      content: notes.error ? (
        <LoadError
          what="this subject's notes"
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />
      ) : (
        <SubjectNotes
          subject={{ type: "SUBJECT", id: subjectId }}
          notes={notes.data?.data ?? []}
          isPending={notes.isPending}
        />
      ),
    },
    {
      value: "files",
      label: "Files",
      count: files.data?.data?.length ?? 0,
      content: files.error ? (
        <LoadError
          what="this subject's files"
          error={files.error}
          onRetry={() => void files.refetch()}
        />
      ) : (
        <SubjectFiles files={files.data?.data ?? []} isPending={files.isPending} />
      ),
    },
  ];

  return (
    <RecordPageShell
      backHref={config.indexHref}
      backLabel={config.labelPlural}
      title={subject.name}
      reference={subject.code}
      subtitle={
        [
          subject.isCore ? "Core" : "Optional",
          subject.passMark == null ? null : `Pass at ${subject.passMark}`,
          subject.isActive ? null : "Not taught",
        ]
          .filter(Boolean)
          .join(" · ") || null
      }
      leading={
        <RecordMark
          kind={config.kind}
          name={subject.name}
          avatarUrl={subject.avatarUrl}
          emoji={subject.emoji}
          accent={subject.accent}
          size="lg"
        />
      }
      attributes={
        <div className="space-y-3">
          {/* The property list commits on blur, so a refused write leaves no
              button holding the fault. Above the list is the only place a
              reader is still looking — and a pass mark that did not save is a
              pass mark somebody will quote at a parents' evening. */}
          {edit.save.error ? <SaveError what="That change" error={edit.save.error} /> : null}
          <RecordAttributes attributes={attributes} />
        </div>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rail={
        <RailSection title="At a glance">
          <dl className="space-y-2 text-sm">
            <Glance label="Classes" value={String(classes.size)} />
            <Glance label="Teachers" value={String(teachers.size)} />
            {/* The number somebody is on this page to fix. */}
            <Glance label="Without a teacher" value={String(unstaffed)} />
          </dl>
        </RailSection>
      }
    />
  );
}

function Glance({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}
