/**
 * Every list the engine draws, by key.
 *
 * Lists join as they move onto the engine; a key that is not here is a list
 * still drawn the old way.
 */
import { COMPANY_REGISTER } from "./defs/company";
import { DEAL_REGISTER } from "./defs/deal";
import { LEAD_REGISTER } from "./defs/lead";
import { PERSON_REGISTER } from "./defs/person";
import { SITE_REGISTER } from "./defs/site";
import type { RegisterDef, RegisterKey } from "./types";

export const REGISTERS = {
  LEAD: LEAD_REGISTER,
  DEAL: DEAL_REGISTER,
  PERSON: PERSON_REGISTER,
  COMPANY: COMPANY_REGISTER,
  SITE: SITE_REGISTER,
} as const satisfies Partial<Record<RegisterKey, RegisterDef>>;

export type EngineRegisterKey = keyof typeof REGISTERS;

export function isEngineRegisterKey(key: string): key is EngineRegisterKey {
  return Object.prototype.hasOwnProperty.call(REGISTERS, key);
}

export function getRegister(key: EngineRegisterKey): RegisterDef {
  return REGISTERS[key];
}
