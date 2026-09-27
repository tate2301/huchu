/**
 * The server halves, by list. Server-only: these read the database.
 */
import type { EngineRegisterKey } from "../registry";
import { companiesRegister } from "./companies";
import { peopleRegister } from "./people";
import { sitesRegister } from "./sites";
import type { RegisterServer } from "./types";

export const REGISTER_SERVERS: Record<EngineRegisterKey, RegisterServer<{ id: string }>> = {
  PERSON: peopleRegister as RegisterServer<{ id: string }>,
  COMPANY: companiesRegister as RegisterServer<{ id: string }>,
  SITE: sitesRegister as RegisterServer<{ id: string }>,
};
