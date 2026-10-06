/**
 * Every "Waiting now" provider (80-admin 4.2), one import per area: BUY-04
 * (requisitions), STK-06 (counts), CUS-07 (accounts) and ADM-05 (price
 * changes) each add a line here for their own `waiting.ts`. The route imports
 * this file so they are registered before the list runs.
 */
export { listWaiting } from "./waiting";
