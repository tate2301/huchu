import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import type { MessagesClient } from "@/lib/vane/claude";
import { jsonIn, VaneWriteRefused, writeAsJob, type Who } from "@/lib/vane/write";

import { searchKnowledge, type KnowledgeHit } from "./store";

/**
 * Ask Vane, on the knowledge base's own page: a question about the business,
 * answered from what the knowledge base holds and nothing else, with what it
 * went by. When nothing in it matches, Vane says so without asking Claude, and
 * the person can write the answer down as an FAQ.
 */

const SYSTEM = `You are Vane, the helper inside Corelith. You answer a question about the business from its own knowledge base: the notes below are all you know about it. Say only what they say, in a few short sentences, first person plural for the business ("we"), plain words, exact figures. When they do not answer the question, say so in a sentence and stop. Answer with only a JSON object.`;

const answerSchema = z.object({
  answer: z.string().trim().min(1).max(3000),
  /** The notes the answer went by, by number. */
  used: z.array(z.number().int().positive()).max(12).default([]),
  /** The notes answered it; false when they did not. */
  answered: z.boolean(),
});

export type KnowledgeAnswer = {
  question: string;
  /** Markdown. */
  answer: string;
  answered: boolean;
  sources: Array<{ title: string; href: string; note: string }>;
};

type Note = { title: string; href: string; note: string; text: string };

/** What a search found, as numbered notes Vane can cite, each with where it lives. */
export function notesFrom(hit: KnowledgeHit): Note[] {
  return [
    ...hit.entries.map((entry) => ({
      title: entry.title,
      href: `/crm/knowledge?tab=${entry.kind.toLowerCase()}`,
      note: entry.kind === "FAQ" ? "FAQ" : entry.kind === "FACT" ? "Fact" : "Tip",
      text: `${entry.kind}: ${entry.title}\n${entry.body}`,
    })),
    ...hit.prices.slice(0, 12).map((price) => ({
      title: price.title,
      href: `/crm/knowledge/${price.docId}`,
      note: price.name,
      text: `PRICE (${price.title}): ${price.name}${price.unit ? `, per ${price.unit}` : ""}: ${price.currency} ${price.unitPrice.toFixed(2)}${price.description ? `. ${price.description}` : ""}`,
    })),
    ...hit.passages.map((passage) => ({ title: passage.title, href: `/crm/knowledge/${passage.docId}`, note: "from the document", text: `FROM ${passage.title}:\n${passage.text}` })),
  ];
}

export async function askKnowledge(db: PrismaClient, who: Who, question: string, client?: MessagesClient): Promise<KnowledgeAnswer> {
  const notes = notesFrom(await searchKnowledge(db, who.companyId, question, 6));
  if (notes.length === 0) {
    return { question, answer: "Nothing in the knowledge base says. When you know the answer, keep it as an FAQ so I can answer it next time.", answered: false, sources: [] };
  }

  const prompt = `The question: ${question}

The notes from the knowledge base, numbered:
${notes.map((note, index) => `[${index + 1}] ${note.text}`).join("\n\n")}

Answer {"answer": "…", "used": [1, 3], "answered": true}. "answer" may use **bold** and short lists; no headings. "used" names the notes you went by.`;

  return writeAsJob(
    db,
    who,
    `Answered from the knowledge base: ${question.slice(0, 80)}`,
    async (ask) => {
      const parsed = answerSchema.safeParse(jsonIn(await ask(prompt)));
      if (!parsed.success) throw new VaneWriteRefused(503, "Vane's answer did not come back whole. Try again.");
      const used = [...new Set(parsed.data.used)].map((n) => notes[n - 1]).filter((note): note is Note => Boolean(note));
      // One source per place: two passages of the same document are one source.
      const sources = used.filter((note, index) => used.findIndex((other) => other.href === note.href && other.note === note.note) === index);
      return { question, answer: parsed.data.answer, answered: parsed.data.answered, sources: sources.map(({ title, href, note }) => ({ title, href, note })) };
    },
    client,
    SYSTEM,
  );
}
