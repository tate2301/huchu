/**
 * What a Manager PIN field says to someone who cannot approve the act
 * themselves (FLR-03; packets 56, 58 and 67 reuse it): who to ask, at most two
 * named, "or" before the last. No imports, so a sheet kind can use it.
 */
export function approvalWarn(names: readonly string[]): string {
  const named = names.slice(0, 2);
  if (named.length === 0) return "Needed. Nobody here can approve it with a PIN yet.";
  return `Needed. Ask ${named.length === 1 ? named[0] : `${named[0]} or ${named[1]}`}.`;
}
