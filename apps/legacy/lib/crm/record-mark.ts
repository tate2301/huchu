import { z } from "zod";

import { ACCENTS } from "@/lib/ui/accents";

/**
 * The mark a record can be given: an emoji, a colour, or an uploaded picture.
 *
 * Shared by every record's update schema so the four of them cannot drift —
 * a company and a person should accept exactly the same thing here.
 *
 * The emoji is length-limited rather than pattern-matched. A regex over the
 * emoji planes is a losing game — families, skin tones and flags are all
 * multi-codepoint sequences, and each Unicode release breaks last year's
 * pattern. A short string in a field that only ever renders as text costs
 * nothing if somebody puts a letter in it.
 */
export const recordMarkFields = {
  emoji: z.string().trim().max(16).nullable().optional(),
  avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
  /**
   * The record's colour. An enum rather than free text: a hue that is not in
   * the palette renders as nothing, and "why is this one grey" is a bug report
   * nobody can act on.
   */
  accent: z.enum(ACCENTS).nullable().optional(),
};

export const recordMarkSchema = z.object(recordMarkFields);

export type RecordMarkInput = z.infer<typeof recordMarkSchema>;
