/**
 * A link into a list, as the list's own address:
 * `/crm/deals?stage=<id>&layout=table`, `/crm/deals?view=won`.
 *
 * Deep links are built here rather than typed out, so a filter renamed in a
 * definition cannot leave a link behind that quietly narrows nothing.
 */
import { writeState } from "./codec";
import { REGISTERS, type EngineRegisterKey } from "./registry";
import type { ViewState } from "./types";

export function registerHref(
  key: EngineRegisterKey,
  state: Partial<ViewState> = {},
  options: { view?: string } = {},
): string {
  const def = REGISTERS[key];
  // Nothing but a view is that view as it was saved; nothing at all is the
  // list as it opens.
  const asSaved = Object.keys(state).length === 0;
  if (asSaved && !options.view) return def.route;
  const query = writeState(def, { ...state, filters: state.filters ?? {} }, { view: options.view, asSaved });
  return `${def.route}?${query}`;
}
