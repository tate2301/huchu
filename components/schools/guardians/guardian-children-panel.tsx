"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge, Button, Card, Combobox, Switch } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { RecordActions } from "@/components/schools/common/record-actions";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { NothingYet, SaveError } from "@/components/schools/common/states";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { fetchSchoolsStudents } from "@/lib/schools/admin-v2";
import { recordType } from "@/lib/records/registry";
import { RELATIONSHIP_OPTIONS, relationshipLabel } from "./relationships";

/**
 * A guardian's children, and what this guardian may be told about each.
 *
 * The list was read-only, which made the two consent flags decorative: a school
 * could grant "may see the fees" when the link was first written and never
 * withdraw it, so a separated parent who should have come off the financial
 * list stayed on it for good. The endpoint to change them has existed since
 * S-0.2; nothing on screen called it.
 *
 * Consent is per link and not per person, which is why it is edited here on the
 * child's row rather than in the guardian's properties: a father may receive
 * one child's results and not another's, and a single switch on the parent
 * would quietly flatten that.
 */

export type GuardianStudentLink = {
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

type LinkDraft = {
  id: string | null;
  studentId: string;
  relationship: string;
  isPrimary: boolean;
  canReceiveFinancials: boolean;
  canReceiveAcademicResults: boolean;
};

const NEW_LINK: LinkDraft = {
  id: null,
  studentId: "",
  relationship: "MOTHER",
  isPrimary: false,
  canReceiveFinancials: true,
  canReceiveAcademicResults: true,
};

export function GuardianChildrenPanel({
  guardianId,
  guardianName,
  links,
}: {
  guardianId: string;
  guardianName: string;
  links: GuardianStudentLink[];
}) {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const [draft, setDraft] = useState<LinkDraft | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "guardian", guardianId] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "guardians"] });
  };

  const save = useMutation({
    mutationFn: (values: LinkDraft) =>
      values.id
        ? fetchJson(`/api/v2/schools/guardian-links/${values.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              relationship: values.relationship,
              isPrimary: values.isPrimary,
              canReceiveFinancials: values.canReceiveFinancials,
              canReceiveAcademicResults: values.canReceiveAcademicResults,
            }),
          })
        : fetchJson("/api/v2/schools/guardian-links", {
            method: "POST",
            body: JSON.stringify({
              guardianId,
              studentId: values.studentId,
              relationship: values.relationship,
              isPrimary: values.isPrimary,
              canReceiveFinancials: values.canReceiveFinancials,
              canReceiveAcademicResults: values.canReceiveAcademicResults,
            }),
          }),
    onSuccess: () => {
      invalidate();
      setDraft(null);
    },
  });

  const detach = useMutation({
    mutationFn: (link: GuardianStudentLink) =>
      fetchJson(`/api/v2/schools/guardian-links/${link.id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const alreadyLinked = useMemo(
    () => new Set(links.map((link) => link.student.id)),
    [links],
  );

  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "picker"],
    queryFn: () => fetchSchoolsStudents({ page: 1, limit: 300 }),
    enabled: draft !== null && draft.id === null,
  });

  const studentOptions = useMemo(
    () =>
      (studentsQuery.data?.data ?? [])
        // A pupil already on this guardian's list would be refused by the
        // unique index anyway; offering them is offering an error.
        .filter((student) => !alreadyLinked.has(student.id))
        .map((student) => ({
          value: student.id,
          label: `${student.lastName}, ${student.firstName} · ${student.studentNo}${
            student.currentClass ? ` · ${student.currentClass.name}` : ""
          }`,
        })),
    [studentsQuery.data, alreadyLinked],
  );

  const canEdit = access.can("schools.students", "edit");

  return (
    <>
      <Card
        title="Children"
        flush
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={!canEdit}
            title={canEdit ? undefined : "This is the registrar to do."}
            onClick={() => setDraft(NEW_LINK)}
          >
            Attach a child
          </Button>
        }
      >
        {save.isError ? (
          <div className="p-3">
            <SaveError what="That link" error={save.error} />
          </div>
        ) : null}
        {detach.isError ? (
          <div className="p-3">
            <SaveError what="That link" error={detach.error} />
          </div>
        ) : null}

        {links.length === 0 ? (
          <div className="p-3">
            <NothingYet
              title="No children attached"
              body="This guardian is linked to no pupil, so they will receive nothing and can see nothing."
              action={
                <Button
                  variant="secondary"
                  disabled={!canEdit}
                  title={canEdit ? undefined : "This is the registrar to do."}
                  onClick={() => setDraft(NEW_LINK)}
                >
                  Attach a child
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--border-subtle)]">
            {links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-3 px-3 py-3">
                <PersonAvatar
                  firstName={link.student.firstName}
                  lastName={link.student.lastName}
                />
                <span className="min-w-0 flex-1">
                  <Link
                    href={recordType("STUDENT").href(link.student.id)}
                    className="block truncate text-sm font-medium text-[var(--text-link)] hover:underline"
                  >
                    {link.student.firstName} {link.student.lastName}
                  </Link>
                  <span className="block truncate text-sm text-[var(--text-muted)]">
                    {[relationshipLabel(link.relationship), link.student.currentClass?.name]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                {/* What this person is actually allowed to be told. A guardian
                    who gets neither is a contact of record and nothing more,
                    and that is worth seeing at a glance rather than opening
                    each child to find. */}
                <span className="flex flex-wrap items-center gap-1.5">
                  {link.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                  {link.canReceiveFinancials ? <Badge tone="neutral">Fees</Badge> : null}
                  {link.canReceiveAcademicResults ? (
                    <Badge tone="neutral">Results</Badge>
                  ) : null}
                </span>

                <RecordActions
                  resource="schools.students"
                  verbs={[
                    {
                      label: "Edit",
                      action: "edit",
                      onSelect: () =>
                        setDraft({
                          id: link.id,
                          studentId: link.student.id,
                          relationship: link.relationship,
                          isPrimary: link.isPrimary,
                          canReceiveFinancials: link.canReceiveFinancials,
                          canReceiveAcademicResults: link.canReceiveAcademicResults,
                        }),
                    },
                    {
                      label: "Detach",
                      action: "archive",
                      tone: "danger",
                      loading: detach.isPending && detach.variables?.id === link.id,
                      confirm: {
                        title: `Detach ${link.student.firstName} from ${guardianName}?`,
                        description:
                          "They stop receiving this pupil's fee notices and results, and lose sight of them on the portal. The pupil's own record is untouched.",
                        confirmLabel: "Detach the child",
                      },
                      onSelect: () => detach.mutate(link),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <RecordDialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open) setDraft(null);
        }}
        title={draft?.id ? "What this guardian may be told" : "Attach a child"}
        description="Consent is held per child, so a parent can receive one pupil's results and not another's."
        size="md"
        errors={save.isError ? [getApiErrorMessage(save.error)] : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft) return;
          if (!draft.id && !draft.studentId) return;
          save.mutate(draft);
        }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={Boolean(draft && !draft.id && !draft.studentId)}
            >
              {draft?.id ? "Save the consent" : "Attach the child"}
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="space-y-4">
            {draft.id ? null : (
              <div className="space-y-1.5">
                <Label>Pupil</Label>
                <Combobox
                  options={studentOptions}
                  value={draft.studentId}
                  onValueChange={(value) =>
                    setDraft((current) =>
                      current ? { ...current, studentId: value } : current,
                    )
                  }
                  placeholder={
                    studentsQuery.isPending ? "Loading the roll…" : "Search the roll"
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="link-relationship">Relationship</Label>
              <Select
                value={draft.relationship.toUpperCase()}
                onValueChange={(value) =>
                  setDraft((current) =>
                    current ? { ...current, relationship: value } : current,
                  )
                }
              >
                <SelectTrigger id="link-relationship">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
              <Switch
                label="First point of contact"
                checked={draft.isPrimary}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, isPrimary: event.target.checked } : current,
                  )
                }
              />
              <p className="text-sm text-[var(--text-muted)]">
                One per pupil. Setting this stands the others down.
              </p>
              <Switch
                label="May be told what the family owes"
                checked={draft.canReceiveFinancials}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, canReceiveFinancials: event.target.checked }
                      : current,
                  )
                }
              />
              <Switch
                label="May be told this pupil's results"
                checked={draft.canReceiveAcademicResults}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, canReceiveAcademicResults: event.target.checked }
                      : current,
                  )
                }
              />
            </div>
          </div>
        ) : null}
      </RecordDialog>
    </>
  );
}
