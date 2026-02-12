import { useEffect } from "react";

export function applyTextInput(current: string, input: string, key: { backspace?: boolean; delete?: boolean }) {
  if (key.backspace || key.delete) return current.slice(0, -1);
  if (!input) return current;
  const code = input.charCodeAt(0);
  if (Number.isNaN(code) || code < 32 || code === 127) return current;
  return `${current}${input}`;
}

export function useInputLock(setInputLocked: ((locked: boolean) => void) | undefined, locked: boolean) {
  useEffect(() => {
    if (!setInputLocked) return;
    setInputLocked(locked);
    return () => {
      setInputLocked(false);
    };
  }, [locked, setInputLocked]);
}
