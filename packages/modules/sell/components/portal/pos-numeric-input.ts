"use client";

export type PosKeypadAction =
  | { type: "digit"; value: string }
  | { type: "decimal" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "preset"; value: string };

export function sanitizeNumericValue(input: string, maxDecimals = 2) {
  const cleaned = input.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts[0]}.${parts.slice(1).join("").slice(0, maxDecimals)}`;
}

export function applyPosKeypadAction(
  currentValue: string,
  action: PosKeypadAction,
  options?: { allowDecimal?: boolean; maxDecimals?: number },
) {
  const allowDecimal = options?.allowDecimal ?? true;
  const maxDecimals = options?.maxDecimals ?? 2;
  const current = sanitizeNumericValue(currentValue || "", maxDecimals);

  if (action.type === "clear") return "";
  if (action.type === "preset") return sanitizeNumericValue(action.value, maxDecimals);
  if (action.type === "backspace") return current.slice(0, -1);
  if (action.type === "decimal") {
    if (!allowDecimal || current.includes(".")) return current;
    return current ? `${current}.` : "0.";
  }
  if (action.type === "digit") {
    if (!/^\d$/.test(action.value)) return current;
    /*
      A leading zero is replaced, not built on.

      Fields that start life at "0" — the opening float is the one a cashier
      meets every morning — turned $200 into "0200" because the digit was
      appended to the zero. It parses to the right number, which is why it
      survived; it just reads like a fault on the one screen where somebody is
      carefully counting cash into a drawer.

      Only a bare "0". "0." is a number being typed and must keep its zero, or
      0.50 becomes .50 halfway through.
    */
    const base = current === "0" ? "" : current;
    return sanitizeNumericValue(`${base}${action.value}`, maxDecimals);
  }
  return current;
}
