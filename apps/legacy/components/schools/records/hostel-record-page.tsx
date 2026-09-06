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
import { BedBoardContent } from "@/components/schools/boarding/bed-board-content";
import { HostelRoomsPanel } from "@/components/schools/boarding/hostel-rooms-panel";
import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Home, Tag, ToggleLeft, UserPlus, Users } from "@corelithzw/ui/lib/icons";
import { recordType } from "@/lib/records/registry";
import { formatSchoolDate } from "@/lib/schools/format";

/**
 * A hostel, as a record.
 *
 * The fifth type. Two things about it are worth reading.
 *
 * **Beds free is counted from beds, not from capacity.** `SchoolHostel.capacity`
 * is a number somebody typed; the beds are what exist. A warden deciding whether
 * they can take another boarder needs the second, and S-1.6 allocates against the
 * second, so this page shows the second and treats `capacity` as the intention it
 * is.
 *
 * **The gender policy is a choice, not a text box.** S-1.6 enforces it when a bed
 * is allocated, so a typo here would not be cosmetic — it would be a boy placed in
 * a girls' house. The options are the values `lib/schools/boarding-rules.ts` knows
 * how to check.
 */

type Bed = { id: string; code: string; status: string; isActive: boolean };

type Room = {
  id: string;
  code: string;
  floor: string | null;
  capacity: number | null;
  isActive: boolean;
  beds: Bed[];
  _count?: { beds?: number; allocations?: number };
};

type Allocation = {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
  } | null;
  room: { id: string; code: string } | null;
  bed: { id: string; code: string } | null;
  term: { id: string; code: string; name: string } | null;
};

type HostelRecord = {
  id: string;
  code: string;
  name: string;
  genderPolicy: string;
  capacity: number | null;
  isActive: boolean;
  avatarUrl: string | null;
  emoji: string | null;
  accent: string | null;
  rooms: Room[];
  allocations: Allocation[];
};

const GENDER_OPTIONS = [
  { value: "MIXED", label: "Mixed" },
  { value: "MALE", label: "Boys" },
  { value: "FEMALE", label: "Girls" },
];

function genderLabel(policy: string): string {
  return GENDER_OPTIONS.find((option) => option.value === policy)?.label ?? policy;
}

export function HostelRecordPage({ hostelId }: { hostelId: string }) {
  const config = recordType("HOSTEL");
  const [activeTab, setActiveTab] = useState("boarders");

  const query = useQuery({
    queryKey: config.queryKey(hostelId),
    queryFn: () => fetchJson<HostelRecord>(config.apiPath(hostelId)),
  });

  const edit = useAttributeEditor({
    path: config.apiPath(hostelId),
    invalidate: [config.queryKey(hostelId), ["schools", "boarding"]],
  });

  const notes = useQuery({
    queryKey: ["records", "comments", "HOSTEL", hostelId],
    queryFn: () =>
      fetchJson<{ data: SubjectNote[] }>(
        `/api/v2/records/comments?subjectType=HOSTEL&subjectId=${hostelId}`,
      ),
  });

  const files = useQuery({
    queryKey: ["records", "files", "HOSTEL", hostelId],
    queryFn: () =>
      fetchJson<{ data: SubjectFile[] }>(
        `/api/v2/records/files?subjectType=HOSTEL&subjectId=${hostelId}`,
      ),
  });

  const hostel = query.data ?? null;

  const attributes = useMemo<RecordAttribute[]>(() => {
    if (!hostel) return [];
    // A mark on every row, and one that means something. The property list
    // falls back to a generic tag for a row that names no icon, so a page that
    // named none at all came out as a column of identical glyphs — which is
    // the ragged column the fallback exists to avoid, drawn the other way up.
    return [
      { id: "name", label: "Name", icon: Home, ...edit.required("name", hostel.name) },
      { id: "code", label: "Code", icon: Tag, mono: true, display: hostel.code },
      {
        id: "genderPolicy",
        label: "Takes",
        icon: Users,
        ...edit.choice("genderPolicy", hostel.genderPolicy, GENDER_OPTIONS),
      },
      {
        id: "capacity",
        label: "Intended capacity",
        icon: UserPlus,
        ...edit.numeric("capacity", hostel.capacity),
      },
      {
        id: "isActive",
        label: "In use",
        icon: ToggleLeft,
        ...edit.choice("isActive", String(hostel.isActive), [
          { value: "true", label: "In use" },
          { value: "false", label: "Closed" },
        ]),
      },
    ];
  }, [hostel, edit]);

  if (query.isPending) {
    return (
      <div className="space-y-4" data-testid="hostel-record-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !hostel) {
    return (
      <Alert variant="destructive">
        <AlertTitle>This hostel could not be loaded</AlertTitle>
        <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const rooms = hostel.rooms ?? [];
  const allocations = hostel.allocations ?? [];

  // Counted from the beds that exist rather than from the capacity somebody
  // typed. A warden takes a boarder against a bed, and so does S-1.6.
  const beds = rooms.flatMap((room) => room.beds ?? []).filter((bed) => bed.isActive);
  const occupied = allocations.length;
  const free = Math.max(0, beds.length - occupied);

  const tabs: RecordTab[] = [
    {
      value: "boarders",
      label: "Boarders",
      count: occupied,
      content: (
        <RelatedList
          items={allocations}
          emptyMessage="Nobody is boarding here this term."
          renderItem={(allocation) => ({
            href: allocation.student
              ? recordType("STUDENT").href(allocation.student.id)
              : "/schools/boarding",
            title: allocation.student
              ? `${allocation.student.firstName} ${allocation.student.lastName}`
              : "Allocation",
            subtitle: [allocation.room?.code, allocation.bed?.code, allocation.term?.name]
              .filter(Boolean)
              .join(" · "),
            meta: formatSchoolDate(allocation.startDate),
          })}
        />
      ),
    },
    {
      // The board the module already had and nobody could reach — every bed in
      // the house, empty ones included, with the verb that fills them.
      value: "beds",
      label: "Beds",
      count: beds.length,
      content: <BedBoardContent hostelId={hostelId} />,
    },
    {
      value: "rooms",
      label: "Rooms",
      count: rooms.length,
      // Was a read-only list, which meant a hostel could be built once and never
      // altered: a partition wall or a new bunk had nowhere to be recorded.
      content: <HostelRoomsPanel hostelId={hostelId} />,
    },
    {
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      content: (
        <SubjectNotes
          subject={{ type: "HOSTEL", id: hostelId }}
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
      title={hostel.name}
      reference={hostel.code}
      subtitle={
        [
          genderLabel(hostel.genderPolicy),
          `${occupied} of ${beds.length} beds`,
          hostel.isActive ? null : "Closed",
        ]
          .filter(Boolean)
          .join(" · ") || null
      }
      leading={
        <RecordMark
          kind={config.kind}
          name={hostel.name}
          avatarUrl={hostel.avatarUrl}
          emoji={hostel.emoji}
          accent={hostel.accent}
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
            <Glance label="Boarders" value={String(occupied)} />
            <Glance label="Beds free" value={String(free)} />
            <Glance label="Rooms" value={String(rooms.length)} />
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
