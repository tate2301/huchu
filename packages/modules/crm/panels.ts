import type { Accent } from "@corelithzw/react";

/**
 * The small facts the record panels are made of.
 *
 * Pure, because every one of them is a thing that reads correctly for months
 * and then gets a date wrong on the day of, or rounds 1024 bytes to "1KB" in
 * one panel and "1.0 KB" in another. Cheaper to pin down here than to notice
 * in a screenshot.
 */

export type Countdown = {
  label: string;
  /** Whether this wants attention now. */
  imminent: boolean;
  past: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long until a meeting, in the words somebody would use.
 *
 * Rounded to the unit that matters: nobody needs "in 2 hours 43 minutes", and
 * everybody needs "in 5 minutes" to be exact. Something within a quarter of an
 * hour is called imminent so a panel can say so rather than leaving the reader
 * to compare a timestamp against their own watch.
 */
export function timeToStart(start: Date | string, now: Date = new Date()): Countdown {
  const at = typeof start === "string" ? new Date(start) : start;
  if (Number.isNaN(at.getTime())) {
    return { label: "Time unknown", imminent: false, past: false };
  }

  const delta = at.getTime() - now.getTime();
  const past = delta < 0;
  const magnitude = Math.abs(delta);

  if (magnitude < MINUTE) {
    return { label: "Starting now", imminent: true, past };
  }

  const say = (value: number, unit: string) =>
    `${value} ${unit}${value === 1 ? "" : "s"}`;

  let phrase: string;
  if (magnitude < HOUR) phrase = say(Math.round(magnitude / MINUTE), "minute");
  else if (magnitude < DAY) phrase = say(Math.round(magnitude / HOUR), "hour");
  else phrase = say(Math.round(magnitude / DAY), "day");

  return {
    label: past ? `${phrase} ago` : `in ${phrase}`,
    imminent: !past && delta <= 15 * MINUTE,
    past,
  };
}

/**
 * A meeting's location, resolved into something to press.
 *
 * The field is one free-text box because that is what people want — sometimes
 * a video link, usually an address, occasionally "the blue gate on Enterprise
 * Road". So it is read rather than configured: a URL becomes Join, anything
 * else becomes a maps search, and empty becomes nothing at all rather than a
 * button that opens a map of nowhere.
 */
export type MeetingPlace =
  | { kind: "join"; url: string }
  | { kind: "map"; url: string; text: string }
  | { kind: "none" };

export function meetingPlace(location: string | null | undefined): MeetingPlace {
  const text = location?.trim();
  if (!text) return { kind: "none" };

  if (/^https?:\/\//i.test(text)) {
    try {
      // Parsed rather than pattern-matched: "https://" alone passes a regex
      // and opens a blank tab.
      const url = new URL(text);
      if (url.hostname) return { kind: "join", url: url.toString() };
    } catch {
      // Not a URL after all — treat it as a place.
    }
  }

  return {
    kind: "map",
    text,
    url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`,
  };
}

export type FileMark = { label: string; accent: Accent };

/**
 * A coloured mark per file type.
 *
 * Colour carries the type so a list of eleven attachments can be scanned for
 * "the PDF" without reading eleven filenames. Grouped by what a thing is
 * rather than by extension — a .jpg and a .heic are both a photo, and nobody
 * cares which camera produced which.
 */
const MARKS: Array<{ accent: Accent; label: string; extensions: string[] }> = [
  { accent: "red", label: "PDF", extensions: ["pdf"] },
  { accent: "blue", label: "DOC", extensions: ["doc", "docx", "rtf", "odt", "pages"] },
  { accent: "green", label: "XLS", extensions: ["xls", "xlsx", "csv", "ods", "numbers"] },
  { accent: "orange", label: "PPT", extensions: ["ppt", "pptx", "key", "odp"] },
  {
    accent: "violet",
    label: "IMG",
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "avif", "svg", "bmp"],
  },
  { accent: "teal", label: "VID", extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"] },
  { accent: "cyan", label: "AUD", extensions: ["mp3", "wav", "m4a", "aac", "ogg"] },
  { accent: "amber", label: "ZIP", extensions: ["zip", "rar", "7z", "tar", "gz"] },
  { accent: "indigo", label: "TXT", extensions: ["txt", "md", "json", "xml", "log"] },
];

const BY_EXTENSION = new Map<string, FileMark>(
  MARKS.flatMap((mark) =>
    mark.extensions.map(
      (extension) => [extension, { label: mark.label, accent: mark.accent }] as const,
    ),
  ),
);

export function fileMark(filename: string | null | undefined): FileMark {
  const name = filename?.trim() ?? "";
  const dot = name.lastIndexOf(".");
  // A leading dot is a hidden file, not an extension: ".gitignore" is not a
  // "GITIGNORE file".
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return BY_EXTENSION.get(extension) ?? { label: "FILE", accent: "gray" };
}

/**
 * A file size somebody can read.
 *
 * Binary units, because that is what every operating system on the desk
 * reports and a file that says 2.1 MB here and 2.0 MB in Finder starts an
 * argument about whether it uploaded properly.
 */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${Math.round(bytes)} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // One decimal below ten, none above: "9.4 MB" is useful precision and
  // "941.3 MB" is three digits of noise.
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
