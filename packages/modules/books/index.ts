// Deep imports are the norm (`@corelithzw/module-books/posting`); this entry
// carries the manifest a host composes with and the hooks it fills.
export { manifest } from "./manifest";
export { onFiscalBacklog, registerFiscalDrainIssuer, type FiscalBacklogEvent } from "./fiscal-drain";
