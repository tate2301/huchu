import type { RecordType } from "@corelithzw/module-records/registry";

/** The record types the school module owns; custom fields are defined against these. */
export const SCHOOL_RECORD_TYPES = [
  "STUDENT",
  "GUARDIAN",
  "TEACHER",
  "CLASS",
  "SUBJECT",
  "HOSTEL",
] as const satisfies readonly RecordType[];

export type SchoolRecordType = (typeof SCHOOL_RECORD_TYPES)[number];
