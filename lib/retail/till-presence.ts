/**
 * Whether this page is a paired till's (set by the till's provider from what
 * the server knew of the device key). The offline warm-ups read it: the
 * shift and what hangs off it answer only a till, so they are not asked for
 * on back-office pages, or on price check before pairing.
 */
let pairedTill = false;

export function markPairedTill(paired: boolean): void {
  pairedTill = paired;
}

export function onPairedTill(): boolean {
  return pairedTill;
}
