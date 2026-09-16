"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { createDetentionSession } from "@/lib/schools/conduct-v2";

/**
 * Schedule a detention session.
 *
 * The supervisor is optional, and that is deliberate rather than lax: a session
 * nobody is supervising is a real state the register draws in red as
 * `Not yet supervised`, and refusing to create one would mean a school could
 * not book the room until it had found a teacher — which is the wrong way
 * round. The gap is meant to be visible.
 */

type Room = { id: string; code: string; name: string };
type Teacher = { id: string; employeeCode: string; user: { name: string | null; email: string } | null };

function localDateTime(offsetDays = 0, hour = 14) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function DetentionSessionDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [startsAt, setStartsAt] = useState(localDateTime(1));
  const [endsAt, setEndsAt] = useState(localDateTime(1, 15));
  const [roomId, setRoomId] = useState("");
  const [supervisorId, setSupervisorId] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStartsAt(localDateTime(1));
      setEndsAt(localDateTime(1, 15));
      setRoomId("");
      setSupervisorId("");
      setLabel("");
      setError(null);
    }
  }

  const roomsQuery = useQuery({
    queryKey: ["schools", "rooms"],
    queryFn: () => fetchJson<{ data: Room[] }>("/api/v2/schools/rooms?limit=200"),
    enabled: open,
  });

  const teachersQuery = useQuery({
    queryKey: ["schools", "teachers", "picker"],
    queryFn: () => fetchJson<{ data: Teacher[] }>("/api/v2/schools/teachers?limit=200"),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () =>
      createDetentionSession({
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        roomId: roomId || null,
        supervisorTeacherProfileId: supervisorId || null,
        label: label.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const canSubmit = Boolean(startsAt && endsAt);

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Schedule a detention session"
      description="A time, a room, and somebody standing at the front. The supervisor can be found later."
      size="md"
      errors={error ? [error] : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit && !save.isPending) save.mutate();
      }}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || save.isPending}>
            {save.isPending ? "Saving…" : "Schedule it"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="session-starts">Starts</Label>
          <Input
            id="session-starts"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-ends">Ends</Label>
          <Input
            id="session-ends"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-room">Room</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger id="session-room">
              <SelectValue placeholder="Pick a room" />
            </SelectTrigger>
            <SelectContent>
              {(roomsQuery.data?.data ?? []).map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="session-supervisor">Supervised by</Label>
          <Select value={supervisorId} onValueChange={setSupervisorId}>
            <SelectTrigger id="session-supervisor">
              <SelectValue placeholder="Not yet supervised" />
            </SelectTrigger>
            <SelectContent>
              {(teachersQuery.data?.data ?? []).map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.user?.name ?? teacher.user?.email ?? teacher.employeeCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-[color:var(--text-muted)]">
            Leave it empty and the session shows as needing a supervisor, in red, until
            somebody is named.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="session-label">What the school calls it</Label>
          <Input
            id="session-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Friday detention"
          />
        </div>
      </div>
    </RecordDialog>
  );
}
