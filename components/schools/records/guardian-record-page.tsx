"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { customFieldAttributes } from "@/components/records/custom-field-attributes";
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
import type { CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";
import { Badge, Lock, Mail, MapPin, Phone, Tag } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";

/**
 * A guardian, as a record.
 *
 * The second type on the shared surface, and the one that shows what S-4.1 and
 * S-4.3 actually bought. It replaces a 195-line hand-rolled page, and what is
 * left is a list of attributes, a list of tabs, and two queries — no shell, no
 * identity strip, no property editor, no mark, no empty-state handling. The
 * student page is the template and this is the same shape with different nouns.
 *
 * The one thing worth reading carefully is the children tab. A guardian's whole
 * purpose is the children they are responsible for, so it is the landing tab and
 * it carries the relationship and the two consent flags — because "can this
 * person be told what the family owes" is the question the office actually opens
 * a guardian for.
 */

type StudentLink = {
  id: string;
  relationship: string;
  isPrimary: boolean;
  canReceiveFinancials: boolean;
  canReceiveAcademicResults: boolean;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
    currentClass: { id: string; code: string; name: string } | null;
  };
};

type GuardianRecord = {
  id: string;
  guardianNo: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  nationalId: string | null;
  avatarUrl: string | null;
  accent: string | null;
  customFields: Record<string, unknown> | null;
  userId: string | null;
  studentLinks: StudentLink[];
};

export function GuardianRecordPage({ guardianId }: { guardianId: string }) {
  const config = recordType("GUARDIAN");
  const [activeTab, setActiveTab] = useState("children");

  const query = useQuery({
    queryKey: config.queryKey(guardianId),
    queryFn: () => fetchJson<GuardianRecord>(config.apiPath(guardianId)),
  });

  const edit = useAttributeEditor({
    path: config.apiPath(guardianId),
    invalidate: [config.queryKey(guardianId), ["schools", "guardians"]],
  });

  const customFields = useQuery({
    queryKey: ["records", "field-definitions", "GUARDIAN"],
    queryFn: () =>
      fetchJson<{ data: CrmFieldDefinitionRecord[] }>(
        "/api/v2/schools/field-definitions?entity=GUARDIAN",
      ),
  });

  const notes = useQuery({
    queryKey: ["records", "comments", "GUARDIAN", guardianId],
    queryFn: () =>
      fetchJson<{ data: SubjectNote[] }>(
        `/api/v2/records/comments?subjectType=GUARDIAN&subjectId=${guardianId}`,
      ),
  });

  const files = useQuery({
    queryKey: ["records", "files", "GUARDIAN", guardianId],
    queryFn: () =>
      fetchJson<{ data: SubjectFile[] }>(
        `/api/v2/records/files?subjectType=GUARDIAN&subjectId=${guardianId}`,
      ),
  });

  const guardian = query.data ?? null;

  const attributes = useMemo<RecordAttribute[]>(() => {
    if (!guardian) return [];
    // A mark on every row, and one that means something. The property list
    // falls back to a generic tag for a row that names no icon, so a page that
    // named none at all came out as a column of identical glyphs — which is
    // the ragged column the fallback exists to avoid, drawn the other way up.
    return [
      {
        id: "phone",
        label: "Phone",
        icon: Phone,
        mono: true,
        ...edit.required("phone", guardian.phone),
      },
      { id: "email", label: "Email", icon: Mail, ...edit.text("email", guardian.email ?? "") },
      {
        id: "guardianNo",
        label: "Guardian number",
        icon: Tag,
        mono: true,
        ...edit.required("guardianNo", guardian.guardianNo),
      },
      {
        id: "address",
        label: "Address",
        icon: MapPin,
        ...edit.text("address", guardian.address ?? ""),
      },
      {
        id: "nationalId",
        label: "National ID",
        // The badge, not the tag: this one is a number on somebody's card,
        // not a reference this system made up.
        icon: Badge,
        mono: true,
        ...edit.text("nationalId", guardian.nationalId ?? ""),
      },
      {
        id: "portal",
        label: "Portal account",
        icon: Lock,
        // Read-only on purpose: an account is claimed through an invitation, not
        // by an administrator typing a flag. Showing it here answers "why can
        // this parent not log in", which is the commonest question about them.
        display: guardian.userId ? "Claimed" : "Not claimed",
      },
    ];
  }, [guardian, edit]);

  if (query.isPending) {
    return (
      <div className="space-y-4" data-testid="guardian-record-loading">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !guardian) {
    return (
      <Alert variant="destructive">
        <AlertTitle>This guardian could not be loaded</AlertTitle>
        <AlertDescription>{getApiErrorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const name = `${guardian.firstName} ${guardian.lastName}`.trim();
  const links = guardian.studentLinks ?? [];

  const tabs: RecordTab[] = [
    {
      value: "children",
      label: "Children",
      count: links.length,
      content: (
        <RelatedList
          items={links}
          emptyMessage="This guardian is not linked to any pupil, so they will receive nothing and can see nothing."
          renderItem={(link) => ({
            href: recordType("STUDENT").href(link.student.id),
            title: `${link.student.firstName} ${link.student.lastName}`,
            subtitle: [link.relationship, link.student.currentClass?.name]
              .filter(Boolean)
              .join(" · "),
            // What this person is actually allowed to be told. A guardian who
            // gets neither is a contact of record and nothing more, and that is
            // worth seeing at a glance rather than opening each child to find.
            meta: [
              link.isPrimary ? "Primary" : null,
              link.canReceiveFinancials ? "Fees" : null,
              link.canReceiveAcademicResults ? "Results" : null,
            ]
              .filter(Boolean)
              .join(" · "),
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
          subject={{ type: "GUARDIAN", id: guardianId }}
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
      title={name}
      reference={guardian.guardianNo}
      subtitle={
        [
          guardian.phone,
          links.length === 1 ? "1 child" : links.length ? `${links.length} children` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null
      }
      leading={
        <RecordMark
          kind={config.kind}
          name={name}
          avatarUrl={guardian.avatarUrl}
          accent={guardian.accent}
          size="lg"
        />
      }
      attributes={
        <RecordAttributes
          attributes={[
            ...attributes,
            ...customFieldAttributes({
              definitions: customFields.data?.data ?? [],
              values: guardian.customFields,
              onCommit: (key, value) => edit.save.mutate({ customFields: { [key]: value } }),
            }),
          ]}
        />
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rail={
        <RailSection title="At a glance">
          <dl className="space-y-2 text-sm">
            <Glance label="Children" value={String(links.length)} />
            <Glance
              label="Gets fee notices"
              value={String(links.filter((link) => link.canReceiveFinancials).length)}
            />
            <Glance
              label="Gets results"
              value={String(links.filter((link) => link.canReceiveAcademicResults).length)}
            />
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
