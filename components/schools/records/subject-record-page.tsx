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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { FileText, Percent, Tag, ToggleLeft, Users } from "@/lib/icons";
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

export function SubjectRecordPage({ subjectId }: { subjectId: string }) {
  const config = recordType("SUBJECT");
  const [activeTab, setActiveTab] = useState("classes");

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
      <div className="space-y-4" data-testid="subject-record-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !subject) {
    return (
      <Alert variant="destructive">
        <AlertTitle>This subject could not be loaded</AlertTitle>
        <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const entries = subject.classSubjects ?? [];
  const classes = new Set(entries.map((entry) => entry.class?.id).filter(Boolean));
  const teachers = new Set(entries.map((entry) => entry.teacherProfile?.id).filter(Boolean));
  const unstaffed = entries.filter((entry) => !entry.teacherProfile).length;

  const tabs: RecordTab[] = [
    {
      value: "classes",
      label: "Classes",
      count: entries.length,
      content: (
        <RelatedList
          items={entries}
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
      ),
    },
    {
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      content: (
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
      content: <SubjectFiles files={files.data?.data ?? []} isPending={files.isPending} />,
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
      attributes={<RecordAttributes attributes={attributes} />}
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
