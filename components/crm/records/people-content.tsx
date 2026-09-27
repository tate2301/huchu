"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge, Button } from "@corelithzw/react";
import { EntityLink } from "@/components/records/entity-link";
import { Building2, Calendar, Coins, Funnel, Mail, MapPin, Phone, Tag, UserRound, Users } from "@/lib/icons";
import { useToast } from "@/components/ui/use-toast";
import { ClientDate } from "@/components/ui/client-date";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CONTACT_TYPE_COLOR, stageColor } from "@/lib/crm/tones";
import type { CrmPersonRecord } from "@/lib/crm/crm-v2";
import { CONTACT_TYPE_OPTIONS, PREFERRED_CHANNEL_OPTIONS, optionLabel } from "@/lib/crm/record-labels";
import { PERSON_REGISTER } from "@/lib/crm/registers/defs/person";

import { PersonFormSheet } from "./person-form-sheet";
import { RecordListPager, type RecordListRow } from "@/components/records/record-list";
import { RecordCell, RecordTable, recordCellTone } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import { DirectoryCell, DirectoryName } from "@/components/records/people-directory";
import { RecordBoard } from "./record-board";
import { GroupedRecordList, bucketByLetter, type RecordListSection } from "@/components/records/record-list-groups";
import { RegisterShell } from "@/components/crm/registers/register-shell";
import { REGISTER_PAGE_SIZE, useRegister } from "@/components/crm/registers/use-register";
import {
  emptyState,
  registerColumns,
  tableSort,
  type ColumnRenderer,
} from "@/components/crm/registers/table-helpers";

type Person = CrmPersonRecord;

/**
 * People: the contact directory, on the list engine.
 *
 * Every filter, the search, the sort and the layout live in the address bar
 * (so a link is the list as it was seen, and a saved view keeps all of it);
 * the table's columns are the reader's to choose and order; ticked rows can
 * be reassigned, grouped, archived or exported.
 */
export function PeopleContent({ openCreate = false }: { openCreate?: boolean }) {
  const register = useRegister<Person>(PERSON_REGISTER);
  const { state, rows: people } = register;
  const layout = state.layout ?? "TABLE";
  const [createOpen, setCreateOpen] = useState(openCreate);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const shows = register.columns.isVisible;

  const moveContactType = useMutation({
    mutationFn: ({ id, contactType }: { id: string; contactType: string }) =>
      fetchJson(`/api/v2/crm/people/${id}`, { method: "PATCH", body: JSON.stringify({ contactType }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm", "people"] }),
    onError: (error) =>
      toast({ title: "Could not change the contact type", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const renderers = useMemo<Record<string, ColumnRenderer<Person>>>(
    () => ({
      name: {
        icon: UserRound,
        cell: (person) => (
          // `code · context`: the reference first, because that is the half
          // that is unique, then the word that tells two Tendai Moyos apart.
          <DirectoryName
            name={person.fullName}
            photoUrl={person.avatarUrl}
            subtitle={[person.personNo, shows("jobTitle") ? null : person.jobTitle].filter(Boolean).join(" · ")}
          />
        ),
      },
      ref: { width: "8rem", cell: (person) => <RecordCell kind="code" value={person.personNo} /> },
      jobTitle: { width: "11rem", cell: (person) => <RecordCell value={person.jobTitle} /> },
      company: {
        icon: Building2,
        width: "13rem",
        cell: (person) => (
          <span className="block truncate">
            {person.client ? (
              <EntityLink href={`/crm/companies/${person.client.id}`} className={recordCellTone("relation")}>
                {person.client.name}
              </EntityLink>
            ) : (
              <span className="text-[var(--text-faint)]">No company</span>
            )}
          </span>
        ),
      },
      email: {
        icon: Mail,
        width: "14rem",
        cell: (person) => <DirectoryCell kind="email" value={person.email} missing="no email" />,
      },
      phone: {
        icon: Phone,
        width: "10rem",
        cell: (person) => <DirectoryCell kind="phone" value={person.phone} missing="no phone" />,
      },
      type: {
        icon: Funnel,
        width: "9rem",
        cell: (person) => (
          <Badge tone="neutral" size="sm">
            {optionLabel(CONTACT_TYPE_OPTIONS, person.contactType)}
          </Badge>
        ),
      },
      deals: {
        icon: Coins,
        width: "5.5rem",
        align: "end",
        cell: (person) => <RecordCell kind="number" value={person._count?.dealContacts ?? 0} />,
      },
      owner: {
        icon: Users,
        width: "10rem",
        cell: (person) => <DirectoryCell value={person.assignedTo?.name} missing="Unassigned" />,
      },
      city: { icon: MapPin, width: "8rem", cell: (person) => <RecordCell value={person.city} /> },
      country: { width: "8rem", cell: (person) => <RecordCell value={person.country} /> },
      channel: {
        width: "9rem",
        cell: (person) => (
          <RecordCell
            value={person.preferredChannel ? optionLabel(PREFERRED_CHANNEL_OPTIONS, person.preferredChannel) : null}
          />
        ),
      },
      tags: { icon: Tag, width: "10rem", cell: (person) => <RecordCell value={person.tags?.join(", ")} /> },
      contacted: {
        icon: Calendar,
        width: "8.5rem",
        cell: (person) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={person.lastContactedAt} mode="date" fallback="never" />
          </span>
        ),
      },
      created: {
        width: "8.5rem",
        cell: (person) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={person.createdAt} mode="date" />
          </span>
        ),
      },
      updated: {
        width: "10rem",
        cell: (person) => (
          <span className="font-mono tabular-nums">
            <ClientDate value={person.updatedAt} />
          </span>
        ),
      },
    }),
    [shows],
  );

  const columns = registerColumns(register, renderers);

  const rows = useMemo<RecordListRow[]>(
    () =>
      people.map((person) => ({
        id: person.id,
        href: `/crm/people/${person.id}`,
        leading: (
          <RecordMark kind="person" name={person.fullName} emoji={person.emoji} avatarUrl={person.avatarUrl} size="md" />
        ),
        title: person.fullName,
        subtitle:
          [person.jobTitle, person.client?.name, person.email ?? person.phone].filter(Boolean).join(" · ") ||
          person.personNo,
        status: (
          <Badge tone="neutral" size="sm">
            {optionLabel(CONTACT_TYPE_OPTIONS, person.contactType)}
          </Badge>
        ),
        facts: [
          { label: "Deals", value: person._count?.dealContacts ?? 0, mono: true },
          { label: "Owner", value: person.assignedTo?.name ?? "Unassigned" },
        ],
      })),
    [people],
  );

  // A directory sorted by name is scanned by name, so it gets a heading per
  // letter (SHAPE-12: sort first, then group). Any other order, or a search
  // ranked by relevance, is a flat list.
  const byName = (state.sort?.key ?? "name") === "name" && (state.sort?.dir ?? "asc") === "asc";
  const sections = useMemo<RecordListSection[]>(
    () =>
      byName && !state.q
        ? bucketByLetter(rows, (row) => String(row.title ?? "")).map((bucket) => ({
            id: bucket.id,
            label: bucket.label,
            rows: bucket.items,
          }))
        : [{ id: "results", label: state.q ? "Results" : "People", rows }],
    [byName, rows, state.q],
  );

  const boardColumns = useMemo(
    () =>
      CONTACT_TYPE_OPTIONS.map(({ value, label }) => ({
        id: value,
        name: label,
        color: CONTACT_TYPE_COLOR[value] ?? stageColor(null),
      })),
    [],
  );
  const boardCards = useMemo(
    () =>
      people.map((person) => ({
        id: person.id,
        columnId: person.contactType,
        href: `/crm/people/${person.id}`,
        row: rows.find((row) => row.id === person.id),
        content: (
          <div className="flex items-start gap-2">
            <RecordMark kind="person" name={person.fullName} emoji={person.emoji} avatarUrl={person.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{person.fullName}</p>
              <p className="truncate text-sm text-[var(--text-muted)]">
                {[person.jobTitle, person.client?.name].filter(Boolean).join(" · ") || person.personNo}
              </p>
              <p className="mt-1 truncate text-sm text-[var(--text-subtle)]">{person.assignedTo?.name ?? "Unassigned"}</p>
            </div>
          </div>
        ),
      })),
    [people, rows],
  );

  const empty = emptyState(register, {
    none: "No people yet",
    noneBody: "Add someone, or convert a lead and its contact comes with it.",
  });
  const emptyAction =
    empty.kind === "none" ? (
      <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
        Add the first person
      </Button>
    ) : empty.kind === "filtered" ? (
      <Button variant="secondary" size="sm" onClick={register.clearFilters}>
        Clear the filters
      </Button>
    ) : undefined;

  const directory = (
    <GroupedRecordList
      sections={sections}
      showJumpStrip={byName && !state.q && rows.length >= 30}
      isLoading={register.query.isLoading}
      emptyTitle={empty.title}
      emptyBody={empty.body}
      emptyAction={emptyAction}
    />
  );

  return (
    <RegisterShell
      register={register}
      title="People"
      createLabel="New person"
      onCreate={() => setCreateOpen(true)}
    >
      {layout === "BOARD" ? (
        <RecordBoard
          columns={boardColumns}
          cards={boardCards}
          isLoading={register.query.isLoading}
          noun={{ one: "person", many: "people" }}
          emptyLabel="No one of this kind"
          onMove={(id, type) => moveContactType.mutate({ id, contactType: type })}
          className="min-h-[24rem]"
        />
      ) : layout === "TABLE" ? (
        <RecordTable
          rows={people}
          columns={columns}
          rowHref={(person) => `/crm/people/${person.id}`}
          isLoading={register.query.isLoading}
          selection={{ selectedIds: register.selection.ids, onChange: register.selection.set }}
          sort={tableSort(register)}
          emptyTitle={empty.title}
          emptyBody={empty.body}
          emptyAction={emptyAction}
          mobile={directory}
        />
      ) : (
        directory
      )}

      {layout === "BOARD" ? null : (
        <RecordListPager
          page={register.page}
          pageSize={REGISTER_PAGE_SIZE}
          total={register.total}
          onPageChange={register.setPage}
        />
      )}

      <PersonFormSheet open={createOpen} onOpenChange={setCreateOpen} />
    </RegisterShell>
  );
}
