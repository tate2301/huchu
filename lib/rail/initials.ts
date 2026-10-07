/**
 * The logo tile's two letters (00-foundations 5.3.2): the first letters of the
 * first two words of the legal name, ignoring words in brackets ("Hurudza
 * Creative (Private) Limited" is "HC"); else of the trading name.
 */
export function logoInitials(legalName: string | null | undefined, tradingName: string | null | undefined): string {
  for (const name of [legalName, tradingName]) {
    const words = (name ?? "")
      .replace(/\([^)]*\)/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter(Boolean);
    if (words.length === 0) continue;
    return words
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("");
  }
  return "?";
}
