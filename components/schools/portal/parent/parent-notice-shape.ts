/**
 * How a notice looks and where it says it came from.
 *
 * Shared by the News list, Home's preview and the detail screen so a notice
 * that is amber in the list is not brand-blue when it opens.
 */

type NoticeShape = { severity: string; type: string };

const TONE: Record<string, string> = {
  CRITICAL: "danger",
  WARNING: "warn",
};

/** "" for the ordinary case, so a caller can drop the modifier class. */
export function noticeTone(severity: string): string {
  return TONE[severity] ?? "";
}

/**
 * The sender line the prototype shows.
 *
 * A notice the office sent is "From the school" — the enum behind it carries
 * the audience, which is a fact about the *sending* and none of the reader's
 * business: a parent looking at their own News tab already knows it was sent to
 * parents, and "Notice parents" is machinery leaking onto their phone. Anything
 * the system raised on its own keeps its humanised type, which is genuinely
 * where it came from.
 */
export function noticeSource(notice: NoticeShape): string {
  if (notice.type.startsWith("SCHOOL_NOTICE_")) return "From the school";
  const words = notice.type.replace(/^SCHOOL_/, "").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
