"use client";

import { useState } from "react";

/**
 * Run a reset the moment a dialog opens, during render rather than in an effect.
 *
 * Every form dialog in the module needs the same thing: when it opens, clear the
 * last error and seed the fields from the record being edited (or empty them for
 * a new one). Written as `useEffect(() => { … }, [open, record])` that is a bug
 * with a lint rule attached — the dialog renders once with the PREVIOUS
 * submission's values still in the boxes and only then clears them, so opening
 * "Add a hostel" straight after editing one flashes the old hostel's name.
 *
 * Adjusting state during render is React's own answer to "a prop changed and
 * some state derives from it": the component re-renders immediately with the new
 * values and nothing is ever painted with the stale ones.
 *
 * The idiom was already written out by hand in `academic-year-form-sheet.tsx`
 * and `application-form-sheet.tsx`, each with a comment explaining it. This is
 * that, extracted, so the next dialog reaches for it instead of an effect.
 *
 *   useOpenTransition(open, () => {
 *     setError(null);
 *     setDraft(hostel ? valuesFrom(hostel) : EMPTY);
 *   });
 *
 * `onOpen` is read fresh on the render that opens the dialog, so it closes over
 * current props without needing to be memoised.
 */
export function useOpenTransition(open: boolean, onOpen: () => void): void {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) onOpen();
  }
}
