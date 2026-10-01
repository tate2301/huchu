"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { useToast } from "@/components/ui/use-toast";
import { getApiErrorMessage } from "@/lib/api-client";

export type SaveState = "saved" | "saving" | "unsaved" | "blocked";

/** What a section heading says about its edits. Nothing once they are saved. */
export const SAVE_STATE_LABELS: Record<SaveState, string | null> = {
  saved: null,
  saving: "Saving…",
  unsaved: "Unsaved",
  blocked: "Not saved — see below",
};

/** How long typing has to pause before it is written. */
const AUTOSAVE_MS = 700;

/**
 * Save an editor's whole body as it is typed, the way every other field on a
 * record saves itself: a pause in typing writes it, and leaving the editor
 * writes whatever is still pending. There is no Save button to forget.
 *
 * `body` is the request body, serialised, so "changed" is a string compare.
 * `save` sends it and may return the body that is now on the server when the
 * server added to it (an id for a new row), so the editor does not read its
 * own refreshed state as another edit. Mount the editor keyed on its record,
 * so the draft is seeded once and a refetch never lands over an edit.
 */
export function useAutosave({
  initialBody,
  body,
  valid,
  save,
}: {
  initialBody: string;
  body: string;
  /** False while the draft would be refused; it waits rather than fails. */
  valid: boolean;
  save: (body: string, options: { keepalive?: boolean }) => Promise<string | void>;
}): SaveState {
  const { toast } = useToast();
  const [savedBody, setSavedBody] = useState(initialBody);

  const mutation = useMutation({
    mutationFn: async (next: string) => (await save(next, {})) ?? next,
    onSuccess: setSavedBody,
    onError: (error) =>
      toast({ title: "Not saved", description: getApiErrorMessage(error), variant: "destructive" }),
  });

  const { mutate, isPending } = mutation;
  useEffect(() => {
    if (body === savedBody || !valid || isPending) return;
    const timer = setTimeout(() => mutate(body), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [body, savedBody, valid, isPending, mutate]);

  // Leaving inside the pause still writes what was typed.
  const pending = useRef<string | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    pending.current = valid && body !== savedBody ? body : null;
    saveRef.current = save;
  });
  useEffect(
    () => () => {
      if (pending.current) void saveRef.current(pending.current, { keepalive: true }).catch(() => undefined);
    },
    [],
  );

  if (isPending) return "saving";
  if (body === savedBody) return "saved";
  return valid ? "unsaved" : "blocked";
}
