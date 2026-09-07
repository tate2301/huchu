"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a rapidly-changing value, so a search box doesn't refetch on every
 * keystroke. Returns the previous value until `delay` has passed with no
 * further changes.
 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
