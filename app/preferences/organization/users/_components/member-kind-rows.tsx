"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { SelectItem } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";
import { setManagedUserMemberKind, type ManagedUserDetail } from "@/lib/user-management-api";

import {
  CommitInput,
  DETAIL_CONTROL_CLASS,
  DetailRow,
  DetailSelect,
  DetailValue,
} from "@/app/management/master-data/operations/_components/register-fields";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Staff or outside accountant (`bk-mg-users`), on a finance officer's record:
 * the firm and the last day of their access. In Books an outside accountant has
 * the owner's rights until that day; outside Books they are a finance officer.
 * Nothing is saved until both the firm and the day are given.
 */
export function MemberKindRows({ user, canEdit, onChanged }: { user: ManagedUserDetail; canEdit: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const outside = user.memberKind === "OUTSIDE_ACCOUNTANT";
  const [choice, setChoice] = React.useState<"STAFF" | "OUTSIDE_ACCOUNTANT">(user.memberKind);
  const [firm, setFirm] = React.useState(user.firmName ?? "");
  const [ends, setEnds] = React.useState(user.accessEndsOn ?? "");
  React.useEffect(() => {
    setChoice(user.memberKind);
    setFirm(user.firmName ?? "");
    setEnds(user.accessEndsOn ?? "");
  }, [user.memberKind, user.firmName, user.accessEndsOn]);

  const save = useMutation({
    mutationFn: setManagedUserMemberKind,
    onSuccess: (_saved, input) => {
      toast({ title: input.memberKind === "STAFF" ? "Staff again" : "Outside accountant until " + day(input.accessEndsOn), variant: "success" });
      onChanged();
    },
    onError: (error) => toast({ title: "Nothing was changed", description: getApiErrorMessage(error), variant: "destructive" }),
  });
  const submit = (nextFirm: string, nextEnds: string) => {
    if (nextFirm.trim() && nextEnds) save.mutate({ userId: user.id, memberKind: "OUTSIDE_ACCOUNTANT", firmName: nextFirm.trim(), accessEndsOn: nextEnds });
  };

  if (user.role !== "FINANCE_OFFICER") return null;
  if (!canEdit) {
    return outside ? (
      <>
        <DetailRow label="Kind">{() => <DetailValue>Outside accountant</DetailValue>}</DetailRow>
        <DetailRow label="Firm">{() => <DetailValue>{user.firmName}</DetailValue>}</DetailRow>
        <DetailRow label="Access ends">{() => <DetailValue mono>{user.accessEndsOn ? day(user.accessEndsOn) : ""}</DetailValue>}</DetailRow>
      </>
    ) : null;
  }
  return (
    <>
      <DetailRow label="Kind">
        {(id) => (
          <DetailSelect
            id={id}
            value={choice}
            disabled={save.isPending}
            onValueChange={(value) => {
              const next = value as "STAFF" | "OUTSIDE_ACCOUNTANT";
              setChoice(next);
              if (next === "STAFF" && outside) save.mutate({ userId: user.id, memberKind: "STAFF" });
            }}
          >
            <SelectItem value="STAFF">Staff</SelectItem>
            <SelectItem value="OUTSIDE_ACCOUNTANT">Outside accountant</SelectItem>
          </DetailSelect>
        )}
      </DetailRow>
      {choice === "OUTSIDE_ACCOUNTANT" ? (
        <>
          <DetailRow label="Firm">
            {(id) => (
              <CommitInput
                id={id}
                value={firm}
                disabled={save.isPending}
                onCommit={(next) => {
                  setFirm(next);
                  submit(next, ends);
                }}
              />
            )}
          </DetailRow>
          <DetailRow label="Access ends">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={ends}
                disabled={save.isPending}
                className={DETAIL_CONTROL_CLASS}
                onChange={(event) => {
                  setEnds(event.target.value);
                  submit(firm, event.target.value);
                }}
              />
            )}
          </DetailRow>
        </>
      ) : null}
    </>
  );
}
