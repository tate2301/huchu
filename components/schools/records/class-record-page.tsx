"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordMark } from "@/components/records/record-mark";
import {
  RailSection,
  RecordPageShell,
  RecordRelated,
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
import { ClassStreamsPanel } from "@/components/schools/classes/class-streams-panel";
import { ClassSubjectsPanel } from "@/components/schools/classes/class-subjects-panel";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { ListRowsSkeleton } from "@/components/records/states";
import {
  Glance,
  GlanceList,
  RecordLoadFailure,
  RecordPageSkeleton,
} from "@/components/schools/records/record-page-parts";
import { fetchJson } from "@/lib/api-client";
import { Calendar, Layers, Tag, UserPlus, Users } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";

/**
 * A class, as a record.
 *
 * The fourth type and the first that is not a person, so this is where the mark
 * changes shape: `RecordMark` gives a class a coloured tile with its emoji or its
 * entity icon rather than initials, because nobody is looking for a *who*.
 *
 * The roll is the landing tab and it is fetched rather than counted. The class
 * endpoint returns `_count.students` and no names, which is enough for a list of
 * classes and not enough for the page you open to answer "who is in Form 1 Blue".
 */

type Stream = { id: string; code: string; name: string; capacity: number | null };

type ClassSubject = {
  id: string;
  subject: { id: string; code: string; name: string; isCore: boolean } | null;
  stream: { id: string; code: string; name: string } | null;
  teacherProfile: {
    id: string;
    employeeCode: string;
    user: { id: string; name: string | null; email: string } | null;
  } | null;
};

type ClassRecord = {
  id: string;
  code: string;
  name: string;
  level: number | null;
  capacity: number | null;
  avatarUrl: string | null;
  emoji: string | null;
  accent: string | null;
  term: { id: string; code: string; name: string } | null;
  streams: Stream[];
  classSubjects: ClassSubject[];
  _count?: { students?: number; streams?: number };
};

type RollStudent = {
  id: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  status: string;
  currentStream: { id: string; name: string } | null;
};

export function ClassRecordPage({ classId }: { classId: string }) {
  const config = recordType("CLASS");
  const [activeTab, setActiveTab] = useState("roll");

  const query = useQuery({
    queryKey: config.queryKey(classId),
    queryFn: () => fetchJson<ClassRecord>(config.apiPath(classId)),
  });

  // The roll, by name. `_count.students` answers "how many" and this answers
  // "who", which is what somebody opening a class actually wants.
  const roll = useQuery({
    queryKey: ["schools", "students", { classId }],
    queryFn: () =>
      fetchJson<{ data: RollStudent[] }>(
        `/api/v2/schools/students?classId=${classId}&limit=200`,
      ),
  });

  const edit = useAttributeEditor({
    path: config.apiPath(classId),
    invalidate: [config.queryKey(classId), ["schools", "classes"]],
  });

  const notes = useQuery({
    queryKey: ["records", "comments", "CLASS", classId],
    queryFn: () =>
      fetchJson<{ data: SubjectNote[] }>(
        `/api/v2/records/comments?subjectType=CLASS&subjectId=${classId}`,
      ),
  });

  const files = useQuery({
    queryKey: ["records", "files", "CLASS", classId],
    queryFn: () =>
      fetchJson<{ data: SubjectFile[] }>(
        `/api/v2/records/files?subjectType=CLASS&subjectId=${classId}`,
      ),
  });

  const record = query.data ?? null;

  const attributes = useMemo<RecordAttribute[]>(() => {
    if (!record) return [];
    // A mark on every row, and one that means something. The property list
    // falls back to a generic tag for a row that names no icon, so a page that
    // named none at all came out as a column of identical glyphs — which is
    // the ragged column the fallback exists to avoid, drawn the other way up.
    return [
      { id: "name", label: "Name", icon: Users, ...edit.required("name", record.name) },
      { id: "code", label: "Code", icon: Tag, mono: true, ...edit.required("code", record.code) },
      {
        id: "level",
        label: "Year group",
        icon: Layers,
        ...edit.numeric("level", record.level),
      },
      {
        id: "capacity",
        label: "Places",
        icon: UserPlus,
        ...edit.numeric("capacity", record.capacity),
      },
      { id: "term", label: "Term", icon: Calendar, display: record.term?.name ?? "—" },
    ];
  }, [record, edit]);

  if (query.isPending) {
    return <RecordPageSkeleton testId="class-record-loading" sections={2} columns={1} />;
  }

  if (query.isError || !record) {
    return (
      <RecordLoadFailure
        notFound="That class"
        what="this class"
        error={query.error}
        backHref={config.indexHref}
        backLabel="Back to the classes"
        onRetry={() => void query.refetch()}
      />
    );
  }

  const students = roll.data?.data ?? [];
  const onRoll = record._count?.students ?? students.length;
  const streams = record.streams ?? [];
  const subjects = record.classSubjects ?? [];

  const tabs: RecordTab[] = [
    {
      value: "roll",
      label: "Roll",
      count: onRoll,
      // The rows it is about to become, not a grey slab the height of a guess:
      // a class of thirty lands as thirty rows and the page should not jump to
      // meet them.
      content: roll.isPending ? (
        <ListRowsSkeleton rows={8} label="Reading the roll" />
      ) : (
        <RelatedList
          items={students}
          emptyMessage="Nobody is in this class yet."
          renderItem={(student) => ({
            href: recordType("STUDENT").href(student.id),
            title: `${student.firstName} ${student.lastName}`,
            subtitle: student.studentNo,
            meta: student.currentStream?.name,
          })}
          // The way in to the register. This tab answers "who is in Form 1
          // Blue" and stops there — it is a class as *master data*, names and
          // nothing else. Ringing a parent, narrowing to the boarders, putting
          // a new pupil in the class or taking one off the roll all happen on
          // the register, which had no door at all until this one.
          action={
            <Button asChild variant="secondary">
              <Link href={`/schools/students/class/${classId}`}>Open the full roll</Link>
            </Button>
          }
        />
      ),
    },
    // Not a read-only echo of the include any more. Timetabling a subject onto
    // the class, moving it to another teacher and taking it off all happen
    // here, beside the line that says History has nobody teaching it.
    {
      value: "subjects",
      label: "Subjects",
      count: subjects.length,
      content: <ClassSubjectsPanel classId={classId} className={record.name} />,
    },
    // Always present, never conditional on there being streams: the tab is
    // where a class *gets* split, and hiding it when the count is nought left
    // the one screen that can create a stream unreachable until one existed.
    {
      value: "streams",
      label: "Streams",
      count: streams.length,
      content: (
        <ClassStreamsPanel
          classId={classId}
          className={record.name}
          classCode={record.code}
          streams={streams}
        />
      ),
    },
    {
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      content: (
        <SubjectNotes
          subject={{ type: "CLASS", id: classId }}
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
      title={record.name}
      reference={record.code}
      primaryAction={
        // The two things a school prints most. The register is deliberately blank
        // — it is what a teacher takes to a lesson when the line is down.
        <span className="flex items-center gap-2">
          <PrintDocumentButton
            sourceKey="schools.class-list"
            filters={{ classId }}
            label="Class list"
          />
          <PrintDocumentButton
            sourceKey="schools.attendance-register"
            filters={{ classId }}
            label="Blank register"
          />
        </span>
      }
      subtitle={
        [
          record.term?.name,
          // Against the roll, not on its own: "28 of 30" is the number a
          // registrar is deciding an admission on.
          record.capacity == null ? `${onRoll} on the roll` : `${onRoll} of ${record.capacity}`,
        ]
          .filter(Boolean)
          .join(" · ") || null
      }
      leading={
        <RecordMark
          kind={config.kind}
          name={record.name}
          avatarUrl={record.avatarUrl}
          emoji={record.emoji}
          accent={record.accent}
          size="lg"
        />
      }
      attributes={<RecordAttributes attributes={attributes} />}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rail={
        <div className="space-y-6">
          <RailSection title="At a glance">
            {/* Neither the roll nor the subject count: the band above says
                "28 of 30" and the section rail carries both counts already.
                What is left is what a registrar is deciding on — whether there
                is room, and whether anything on the timetable has nobody
                against it. */}
            <GlanceList>
              <Glance
                label="Places left"
                value={
                  record.capacity == null
                    ? "No limit set"
                    : String(Math.max(0, record.capacity - onRoll))
                }
              />
              <Glance
                label="Subjects with no teacher"
                value={subjects.filter((entry) => !entry.teacherProfile).length || "None"}
              />
            </GlanceList>
          </RailSection>

          {/*
            The same class, in the two modules that hold the rest of it. This
            page is the only one in the product that is *about* a year group,
            so it is where "what does Form 1 Blue owe" and "has Form 1 Blue
            been marked" should be one click from, rather than a trip back out
            to Finance or Results to pick the class off a grid again.

            The roll is deliberately not in this list: it has its own way in at
            the foot of the Roll tab, under the names it is the fuller version
            of, and a rail row repeating it would be the same door twice on one
            screen.

            In the rail rather than the shell's `related` slot because that
            slot is a desktop-only aside, and a door that disappears on a phone
            is the failure this exists to fix.
          */}
          <RailSection title="This class elsewhere">
            <RecordRelated
              items={[
                { href: `/schools/finance/class/${classId}`, label: "Fees" },
                { href: `/schools/results/class/${classId}`, label: "Marks" },
              ]}
            />
          </RailSection>
        </div>
      }
    />
  );
}
