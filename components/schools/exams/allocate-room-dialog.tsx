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
import { allocateRoom } from "@/lib/schools/exams-v2";

/**
 * Give a room to a session, with somebody standing in it.
 *
 * The invigilator is either a member of the teaching staff or a named person
 * who is not one — the school nurse in the sick bay is the case the artboard
 * draws — so both are offered and exactly one is expected. A room with nobody
 * invigilating is drawn in red rather than refused: it is a gap a school has to
 * see.
 */

type Room = { id: string; code: string; name: string; capacity: number | null };
type Teacher = {
  id: string;
  employeeCode: string;
  user: { name: string | null; email: string } | null;
};

export function AllocateRoomDialog({
  open,
  onOpenChange,
  seriesId,
  sessionId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seriesId: string;
  sessionId: string | null;
  onSaved: () => void;
}) {
  const [roomId, setRoomId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [capacity, setCapacity] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [invigilatorName, setInvigilatorName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRoomId("");
      setPurpose("");
      setCapacity("");
      setTeacherId("");
      setInvigilatorName("");
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
      allocateRoom(seriesId, {
        sessionId: sessionId as string,
        roomId,
        purpose: purpose.trim() || null,
        capacity: capacity ? Number(capacity) : null,
        invigilatorTeacherProfileId: teacherId || null,
        invigilatorName: invigilatorName.trim() || null,
      }),
    onSuccess: () => {
      setError(null);
      onSaved();
    },
    onError: (mutationError) => setError(getApiErrorMessage(mutationError)),
  });

  const canSubmit = Boolean(sessionId) && roomId.length > 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Give a room to this session"
      description="A room, how many desks are in it, and who is standing at the front."
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
            {save.isPending ? "Saving…" : "Give it the room"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="allocate-room">Room</Label>
          <Select
            value={roomId}
            onValueChange={(next) => {
              setRoomId(next);
              const room = (roomsQuery.data?.data ?? []).find((entry) => entry.id === next);
              if (room?.capacity) setCapacity(String(room.capacity));
            }}
          >
            <SelectTrigger id="allocate-room">
              <SelectValue placeholder="Pick a room" />
            </SelectTrigger>
            <SelectContent>
              {(roomsQuery.data?.data ?? []).map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                  {room.capacity ? ` · ${room.capacity} places` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="allocate-capacity">Desks in it for this sitting</Label>
          <Input
            id="allocate-capacity"
            type="number"
            min={1}
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
          <p className="text-xs text-[color:var(--text-muted)]">
            An exam room holds fewer than a lesson does. This is the number seats are filled to.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="allocate-purpose">What it is for</Label>
          <Input
            id="allocate-purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Separate room, sick bay"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="allocate-teacher">Invigilator on the staff</Label>
          <Select value={teacherId} onValueChange={setTeacherId}>
            <SelectTrigger id="allocate-teacher">
              <SelectValue placeholder="Nobody yet" />
            </SelectTrigger>
            <SelectContent>
              {(teachersQuery.data?.data ?? []).map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.user?.name ?? teacher.user?.email ?? teacher.employeeCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="allocate-name">Or somebody who is not on the teaching staff</Label>
          <Input
            id="allocate-name"
            value={invigilatorName}
            onChange={(event) => setInvigilatorName(event.target.value)}
            placeholder="Sister Moyo, school nurse"
          />
        </div>
      </div>
    </RecordDialog>
  );
}
