/**
 * Why a teams action was refused. One code per failure the flows name, so a
 * screen can give each its own way out; the message is already plain.
 */
export type TeamsRefusalCode =
  | "NOT_A_MEMBER"
  | "NOT_ALLOWED"
  | "OWNER_ONLY"
  | "IS_OWNER"
  | "SELF"
  | "LAST_ADMIN"
  | "SEATS_FULL"
  | "NOT_FOUND"
  | "EXPIRED"
  | "NOT_OPEN"
  | "ALREADY_MEMBER"
  | "INVALID"
  | "ALREADY_ON_TEAM"
  | "NOT_ON_TEAM"
  | "DISABLED";

export class TeamsRefusal extends Error {
  readonly code: TeamsRefusalCode;

  constructor(code: TeamsRefusalCode, message: string) {
    super(message);
    this.name = "TeamsRefusal";
    this.code = code;
  }
}
