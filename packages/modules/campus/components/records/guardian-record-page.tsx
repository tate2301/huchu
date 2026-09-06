"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { customFieldAttributes } from "@corelithzw/module-records/components/custom-field-attributes";
import { RecordAttributes, type RecordAttribute } from "@corelithzw/module-records/components/record-attributes";
import { RecordMark } from "@corelithzw/module-records/components/record-mark";
import {
  RailSection,
  RecordPageShell,
  type RecordTab,
} from "@corelithzw/module-records/components/record-page-shell";
import {
  SubjectFiles,
  SubjectNotes,
  type SubjectFile,
  type SubjectNote,
} from "@corelithzw/module-records/components/subject-tabs";
import { useAttributeEditor } from "@corelithzw/module-records/components/use-attribute-editor";
import {
  GuardianChildrenPanel,
  type GuardianStudentLink,
} from "../guardians/guardian-children-panel";
import { GuardianPortalPanel } from "../guardians/guardian-portal-panel";
import { RecordActions } from "../common/record-actions";
import { RecordNotFound } from "../common/states";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { fetchJson } from "@corelithzw/platform/api-client";
import type { FieldDefinitionRecord } from "@corelithzw/module-records/custom-fields";
import { Badge, Lock, Mail, MapPin, Phone, Tag } from "@corelithzw/ui/lib/icons";
import { recordType } from "@corelithzw/module-records/registry";

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
  studentLinks: GuardianStudentLink[];
};

export function GuardianRecordPage({ guardianId }: { guardianId: string }) {
  const config = recordType("GUARDIAN");
  const router = useRouter();
  const queryClient = useQueryClient();
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
      fetchJson<{ data: FieldDefinitionRecord[] }>(
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

  const remove = useMutation({
    mutationFn: () => fetchJson(config.apiPath(guardianId), { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "guardians"] });
      // Back to the list rather than a record that is no longer there.
      router.push(config.indexHref);
    },
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
      <RecordNotFound
        what="That guardian"
        backHref={config.indexHref}
        backLabel="Back to the guardians"
      />
    );
  }

  const name = `${guardian.firstName} ${guardian.lastName}`.trim();
  const links = guardian.studentLinks ?? [];

  const tabs: RecordTab[] = [
    {
      value: "children",
      label: "Children",
      count: links.length,
      // The landing view carries both halves of what an office opens a guardian
      // for: which children they answer for, and whether they can log in at all.
      content: (
        <div className="space-y-4">
          <GuardianChildrenPanel
            guardianId={guardianId}
            guardianName={name}
            links={links}
          />
          <GuardianPortalPanel
            guardianId={guardianId}
            guardianNo={guardian.guardianNo}
            name={name}
            email={guardian.email}
            hasAccount={Boolean(guardian.userId)}
          />
        </div>
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
      // Removing a parent is a record-level act, so it sits in the app bar with
      // the record's name rather than inside one of its sections. Gated, and
      // refused outright while a child is still attached — the API says the
      // same, and hearing it before the click beats hearing it as a 409.
      primaryAction={
        <RecordActions
          resource="schools.students"
          verbs={[
            {
              label: "Delete",
              action: "archive",
              tone: "danger",
              loading: remove.isPending,
              unavailable:
                links.length > 0
                  ? "Detach their children first — a guardian with a child on the roll cannot be removed."
                  : undefined,
              confirm: {
                title: `Delete ${name}?`,
                description:
                  "Their contact details and any portal invitation go with them. Nothing about the pupils changes.",
                confirmLabel: "Delete the guardian",
              },
              onSelect: () => remove.mutate(),
            },
          ]}
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
            {/* Yes or no, not a count. "Gets fee notices: 1" of one child reads
                as a quantity of notices; what the office is asking is whether
                this person may be told what the family owes at all. */}
            <Glance
              label="Gets fee notices"
              value={links.some((link) => link.canReceiveFinancials) ? "Yes" : "No"}
            />
            <Glance
              label="Gets results"
              value={links.some((link) => link.canReceiveAcademicResults) ? "Yes" : "No"}
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
