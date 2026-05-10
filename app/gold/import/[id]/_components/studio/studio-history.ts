"use client";

import { useCallback, useReducer } from "react";

export type HistoryEntry = {
  entryId: string;
  field: string;
  before: unknown;
  after: unknown;
};

type HistoryState = {
  past: HistoryEntry[][];
  future: HistoryEntry[][];
};

type HistoryAction =
  | { type: "PUSH"; entries: HistoryEntry[] }
  | { type: "UNDO" }
  | { type: "REDO" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "PUSH":
      return { past: [...state.past, action.entries], future: [] };
    case "UNDO": {
      if (state.past.length === 0) return state;
      const next = [...state.past];
      const popped = next.pop()!;
      return { past: next, future: [popped, ...state.future] };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = [...state.future];
      const popped = next.shift()!;
      return { past: [...state.past, popped], future: next };
    }
    default:
      return state;
  }
}

export function useStudioHistory() {
  const [state, dispatch] = useReducer(historyReducer, { past: [], future: [] });

  const push = useCallback((entries: HistoryEntry[]) => {
    dispatch({ type: "PUSH", entries });
  }, []);

  const undo = useCallback(() => {
    if (state.past.length === 0) return null;
    const entries = state.past[state.past.length - 1];
    dispatch({ type: "UNDO" });
    return entries;
  }, [state.past]);

  const redo = useCallback(() => {
    if (state.future.length === 0) return null;
    const entries = state.future[0];
    dispatch({ type: "REDO" });
    return entries;
  }, [state.future]);

  return {
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    push,
    undo,
    redo,
    undoStack: state.past,
  };
}
