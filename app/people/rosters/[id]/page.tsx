"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { BkBlock, BkFacts, BkLoading, BkPage, BkRecord, BkRecordHead, None, St, Worksheet, type WsColumn } from "@/components/books/ui";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { Button, Field, Person, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchEmployees } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { shortDay } from "@/lib/books/format";
import { canManageRosters } from "@/lib/people/rosters";

type Crew = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  site: { id: string; name: string } | null;
  leader: { id: string; name: string; employeeId: string } | null;
  schedules: Array<{ id: string; date: string; shift: string }>;
};
type Member = { id: string; employee: { id: string; name: string; employeeId: string; phone: string | null } };

/** One crew: who leads it, who is on it, and the shifts it is scheduled for. */
export default function CrewRecordPage() {
  const id = useParams<{ id: string }>()?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const canManage = canManageRosters((session?.user as { enabledFeatures?: string[] } | undefined)?.enabledFeatures);
  const [addId, setAddId] = React.useState("");

  const crewQuery = useQuery({ queryKey: ["roster-crew", id], queryFn: () => fetchJson<Crew>(`/api/people/rosters/${id}`), enabled: Boolean(id) });
  const membersQuery = useQuery({
    queryKey: ["roster-members", id],
    queryFn: () => fetchJson<{ data: Member[] }>(`/api/people/rosters/${id}/members?active=true`),
    enabled: Boolean(id),
  });
  const employees = useQuery({ queryKey: ["employees", "crew-add"], queryFn: () => fetchEmployees({ active: true, limit: 300 }) }).data?.data ?? [];

  const members = React.useMemo(() => membersQuery.data?.data ?? [], [membersQuery.data]);
  const crew = crewQuery.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["roster-members", id] });
    void queryClient.invalidateQueries({ queryKey: ["roster-crews"] });
  };
  const failed = (error: unknown) => toast({ title: getApiErrorMessage(error), variant: "destructive" });

  const add = useMutation({
    mutationFn: (employeeId: string) => fetchJson(`/api/people/rosters/${id}/members`, { method: "POST", body: JSON.stringify({ employeeIds: [employeeId] }) }),
    onSuccess: () => {
      setAddId("");
      toast({ title: "Added to the crew" });
      refresh();
    },
    onError: failed,
  });
  const remove = useMutation({
    mutationFn: (memberId: string) => fetchJson(`/api/people/rosters/${id}/members/${memberId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Removed from the crew" });
      refresh();
    },
    onError: failed,
  });

  if (crewQuery.isLoading) return <BooksLoading />;
  if (crewQuery.error || !crew) return <BooksError what="The crew" error={crewQuery.error} onRetry={() => void crewQuery.refetch()} />;

  const onCrew = new Set(members.map((member) => member.employee.id));
  const addable = employees.filter((employee) => !onCrew.has(employee.id));

  const columns: Array<WsColumn<Member>> = [
    { key: "name", head: "Member", cell: (m) => <Person name={m.employee.name} sub={m.employee.employeeId}><Link href={`/people/${m.employee.id}`}>{m.employee.name}</Link></Person> },
    { key: "phone", head: "Phone", className: "muted mono", cell: (m) => m.employee.phone || <None /> },
    {
      key: "remove",
      head: "",
      right: true,
      cell: (m) =>
        canManage && m.employee.id !== crew.leader?.id ? (
          <Button variant="quiet" size="sm" busy={remove.isPending} onClick={() => remove.mutate(m.id)}>
            Remove
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageChrome title={crew.name} reference={crew.code} backHref="/people/rosters" backLabel="Rosters" />

      <BkPage screen="crew-record" scroll={false}>
        <BkRecord
          side={
            <BkBlock icon="clock" title="Scheduled shifts" meta={crew.schedules.length ? String(crew.schedules.length) : null}>
              {crew.schedules.length === 0 ? (
                <p className="muted">None scheduled.</p>
              ) : (
                <ul className="k-hist">
                  {crew.schedules.map((schedule) => (
                    <li key={schedule.id}>
                      <span />
                      <span className="mono">{shortDay(schedule.date.slice(0, 10))}</span>
                      <span className="muted">{schedule.shift.toLowerCase().replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </BkBlock>
          }
        >
          <BkRecordHead
            title={crew.name}
            meta={[
              <St key="s" tone={crew.isActive ? "done" : "void"}>
                {crew.isActive ? "Active" : "Archived"}
              </St>,
              crew.code ? <span key="c" className="mono">{crew.code}</span> : "No code",
              crew.site?.name ?? "No site",
            ]}
          />
          <BkFacts
            items={[
              { label: "Leader", value: crew.leader ? <Person name={crew.leader.name} /> : <None /> },
              { label: "Members", value: members.length, mono: true },
              { label: "Site", value: crew.site?.name ?? <None /> },
              { label: "Code", value: crew.code ?? <None />, mono: true },
            ]}
          />

          {membersQuery.isLoading ? (
            <BkLoading rows={4} />
          ) : (
            <Worksheet label="crew members" rows={members} rowKey={(m) => m.id} columns={columns} empty="No members yet." />
          )}

          {canManage ? (
            <BkBlock icon="add" title="Add someone">
              <Field label="Employee">
                <Select value={addId} onChange={(e) => setAddId(e.target.value)}>
                  <option value="">Choose</option>
                  {addable.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.employeeId || "no ID"})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" disabled={!addId} busy={add.isPending} onClick={() => add.mutate(addId)}>
                Add to the crew
              </Button>
            </BkBlock>
          ) : null}
        </BkRecord>
      </BkPage>
    </>
  );
}
