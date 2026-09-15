"use client";

import { useState } from "react";
import Link from "next/link";

import { ChatCircle, ChevronRight } from "@/lib/icons";

/**
 * S-6.19 — an answer without ringing the office.
 *
 * The questions are the ones a school office actually fields, in the order they
 * are asked, and each answer says what the parent can do rather than how the
 * system works. "Why can't I see marks?" is answered with "the school releases
 * them once they are checked" — not with the words "publish window".
 */
const QUESTIONS: Array<{ q: string; a: string }> = [
  {
    q: "Why can't I see my child's marks?",
    a: "Marks appear once the school has checked them and released them. Until then there is nothing to read — nothing has been lost. If other parents in the class can see theirs, ring the office.",
  },
  {
    q: "The fees figure looks wrong.",
    a: "Open the bill and read the lines: tuition, levies, boarding and extras are billed separately, and a payment can take a day to be receipted. If a payment you made is not listed, bring the reference to the office.",
  },
  {
    q: "My child was marked away but they were at school.",
    a: "A register the teacher has not sent in yet is drawn with a dashed edge on the attendance grid and can still change. If it is sent in and wrong, tell the class teacher — they can correct it.",
  },
  {
    q: "How do I get a receipt or a statement?",
    a: "Both are on the Fees screen. A statement covers everything charged and paid; a receipt covers one payment. They download as PDFs you can keep or forward.",
  },
  {
    q: "I have two children here but only see one.",
    a: "Tap the name beside the bell at the top of the screen to switch between them, or open You to see all of them. If a child is missing, the office needs to link them to your account.",
  },
  {
    q: "Someone else uses this phone.",
    a: "Sign out from the You screen when you are finished. Signing out ends the session on this phone.",
  },
];

export function ParentHelpScreen() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="pp-page">
      <div className="section-h">Common questions</div>
      {QUESTIONS.map((item, index) => {
        const expanded = open === index;
        return (
          <div key={item.q} className="faq-card">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : index)}
              aria-expanded={expanded}
            >
              <span className="min-w-0 flex-1">{item.q}</span>
              <ChevronRight className="chev size-4" aria-hidden />
            </button>
            {expanded ? <p>{item.a}</p> : null}
          </div>
        );
      })}

      {/* The school's own phone, email and WhatsApp belong here; until the
          portal can read them, the one channel it can open is the one it
          already owns. */}
      <div className="section-h">Still stuck</div>
      <div className="card-block boxed">
        <Link href="/portal/parent/messages" className="pl-row cl">
          <span className="ic-tile brand">
            <ChatCircle className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="nm block">Write to the school</span>
            <span className="sb block">It goes to the office, and they reply here</span>
          </span>
          <ChevronRight className="chev size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
