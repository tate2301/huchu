import { useEffect } from "react";

function stripControlChars(input: string): string {
  return Array.from(input)
    .filter((char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) {
        return false;
      }
      return codePoint >= 32 && codePoint !== 127;
    })
    .join("");
}

export function applyTextInput(current: string, input: string, key: { backspace?: boolean; delete?: boolean }) {
  if (key.backspace || key.delete) {
    return Array.from(current).slice(0, -1).join("");
  }
  if (!input) return current;

  const sanitizedChunk = stripControlChars(input);
  if (!sanitizedChunk) return current;

  return `${current}${sanitizedChunk}`;
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
