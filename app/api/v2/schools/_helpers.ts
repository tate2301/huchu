import { Prisma } from "@prisma/client";
import { z } from "zod";

export const schoolStudentStatusSchema = z.enum([
  "APPLICANT",
  "ACTIVE",
  "SUSPENDED",
  "GRADUATED",
  "WITHDRAWN",
]);

export const schoolEnrollmentStatusSchema = z.enum([
  "ACTIVE",
  "TRANSFERRED",
  "WITHDRAWN",
  "COMPLETED",
]);

export const schoolBoardingAllocationStatusSchema = z.enum([
  "ACTIVE",
  "TRANSFERRED",
  "ENDED",
]);

export const schoolLeaveRequestTypeSchema = z.enum(["LEAVE", "OUTING"]);

export const schoolLeaveRequestStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CHECKED_OUT",
  "CHECKED_IN",
  "REJECTED",
  "CANCELED",
]);

export const schoolResultSheetStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "HOD_APPROVED",
  "HOD_REJECTED",
  "PUBLISHED",
]);

export const dateInputSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Invalid date value",
  });

export const optionalDateInputSchema = dateInputSchema.optional();
export const nullableDateInputSchema = dateInputSchema.nullable().optional();

export function toOptionalDate(value?: string | null) {
  if (!value) return undefined;
  return new Date(value);
}

export function toNullableDate(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

export function normalizeOptionalNullableString(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}
