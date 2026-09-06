"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Callout,
  Card,
} from "@corelithzw/react";

type Entry = {
  id: string;
  question: string;
  answer: React.ReactNode;
};

/**
 * How the portal works, written from what it actually does.
 *
 * Every answer below was checked against the code that runs it: the register
 * screen's locked state, the marks sheet's treatment of an absent pupil, the
 * publish route's approval and window checks, the term-scoped class
 * assignments the rail is built from. A help centre that describes a product
 * the school does not have is worse than none — the teacher follows it, the
 * portal disagrees, and they stop trusting both.
 */
const GUIDES: Entry[] = [
  {
    id: "register",
    question: "Taking the register",
    answer: (
      <>
        <p>
          Pick the class in the rail on the left, then open Attendance. The rail
          is the anchor for the whole portal: every screen shows the class you
          chose there.
        </p>
        <p>
          Mark each pupil present, absent, late or excused with one tap. Most
          days the honest answer is everybody, so use “Everyone present” and
          then change the two or three who are not. The counters at the top move
          as you tap, and the bar at the bottom says how many are still
          unmarked before you save.
        </p>
        <p>
          Unmarked is a state of its own — a pupil you never answered for is not
          silently recorded as present. The date box in the card header opens a
          different day if you are catching up on one you missed.
        </p>
      </>
    ),
  },
  {
    id: "marks",
    question: "Entering marks for a test",
    answer: (
      <>
        <p>
          Open Enter marks and choose the assessment. The card header says what
          it is out of, so you can enter the raw score rather than a percentage.
          The office creates assessments; if the one you want is not in the list,
          it has not been set up yet.
        </p>
        <p>
          Mark a pupil who was not there as absent rather than giving them zero.
          Absent and zero mean different things to a term average, and a zero
          that stands in for absence drags a child down for the rest of the
          term.
        </p>
        <p>
          Saving records every score you have filled in. A blank stays blank, so
          you can mark half the pile now and the rest tonight.
        </p>
      </>
    ),
  },
  {
    id: "today",
    question: "Reading your day",
    answer: (
      <>
        <p>
          Today lays out every period on your timetable, free ones included, and
          opens on the lesson you are standing in. A lesson whose register you
          have not taken is marked, not hidden — a screen that only listed what
          was done would be silent about the thing you are behind on.
        </p>
        <p>
          The papers waiting to be marked are counted there too, and in the top
          bar, so the number follows you around the portal.
        </p>
      </>
    ),
  },
  {
    id: "classes",
    question: "Switching between your classes",
    answer: (
      <>
        <p>
          Your classes sit at the top of the rail with the number of pupils in
          each. Choosing one changes what the register, the marks sheet and
          everything else below it are about, and the choice follows you between
          screens until you reload.
        </p>
        <p>
          The list is the classes you teach this term. Class and subject
          together make an entry, so teaching two subjects to one form shows as
          two rows.
        </p>
      </>
    ),
  },
];

const FAQ: Entry[] = [
  {
    id: "wrong-mark",
    question: "I marked the wrong pupil. Can I fix it?",
    answer: (
      <p>
        Yes, as long as the day is still open. Open Attendance, set the date
        back to that day if it was not today, change the pupil and save again.
        Saving replaces what was recorded for everyone on screen, so it is a
        correction rather than a second register.
      </p>
    ),
  },
  {
    id: "locked",
    question: "What happens when the office locks a day?",
    answer: (
      <p>
        The register opens read-only and says so at the top. Locking is how the
        office closes a day off once attendance has been reported, so nothing
        changes underneath a figure they have already sent on. If something in a
        locked day is genuinely wrong, ask them to reopen it — you cannot
        override it from here.
      </p>
    ),
  },
  {
    id: "publish",
    question: "Why can I not publish marks to parents?",
    answer: (
      <p>
        Publishing is the school&apos;s decision, not one teacher&apos;s. You
        enter marks and submit the sheet; the head of department approves it;
        the office publishes it, and only while a publishing window is open for
        that term and class. A saved mark is recorded but not visible to a
        parent, which is why one can be asking about a result you entered this
        morning.
      </p>
    ),
  },
  {
    id: "missing-class",
    question: "A class I teach is missing from my rail",
    answer: (
      <p>
        Class assignments are held per term. If the term has rolled over, or the
        assignment was ended, the class drops out of the rail even though you
        still teach it in the room. The office adds it back against the current
        term.
      </p>
    ),
  },
  {
    id: "empty-roll",
    question: "The class list is empty",
    answer: (
      <p>
        The roll is built from pupils actively enrolled in that class this term.
        A child who has been transferred, withdrawn or never enrolled against
        the class will not appear, however often they turn up to the lesson.
        That is an office fix, not a portal one.
      </p>
    ),
  },
  {
    id: "profile",
    question: "My name or staff code is wrong",
    answer: (
      <p>
        Those come from the staff record the office keeps, and they are
        read-only here on purpose: a register, a mark sheet and anything sent to
        a parent all read the same record. Your profile lists which fields the
        office owns and who to ask.
      </p>
    ),
  },
  {
    id: "password",
    question: "I have forgotten my password",
    answer: (
      <p>
        Ask the school office. An administrator resets it and you sign in again
        with the new one — there is no self-service reset in this portal yet.
      </p>
    ),
  },
  {
    id: "offline",
    question: "Does the portal work without a connection?",
    answer: (
      <p>
        Not yet. Nothing queues on the device: a register or a mark sheet needs
        a connection at the moment you save it. If the room has no signal, take
        the register on paper and enter it later against that date rather than
        leaving the tablet open and hoping.
      </p>
    ),
  },
  {
    id: "who-sees",
    question: "Who can see what I enter?",
    answer: (
      <p>
        The office and your head of department, as part of moderating and
        publishing. Access to pupil records is written to an audit trail the
        office can read, which is the same protection working in your favour: a
        record of who opened what.
      </p>
    ),
  },
];

/**
 * The teacher portal's help centre.
 *
 * Two accordions rather than the demo's grid of cards that open nothing: a
 * guide is only useful when it can be read, and a native disclosure list is
 * both the design system's accordion and the thing that works with a keyboard
 * on a shared tablet.
 *
 * The demo closes with an IT desk, a room number and an extension. Those
 * belong to the school it was drawn for, not to every school running this, so
 * the last word here points at the office instead of inventing a help desk
 * that does not answer.
 */
export function TeacherHelpScreen() {
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="How-to guides"
        subtitle="The four things this portal is for, and how each one behaves"
      >
        <Accordion multiple>
          {GUIDES.map((guide) => (
            <AccordionItem key={guide.id} value={guide.id}>
              <AccordionTrigger>{guide.question}</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2 t-body">{guide.answer}</div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>

      <Card
        title="Frequently asked"
        subtitle="What teachers ask the office about this portal"
      >
        <Accordion multiple>
          {FAQ.map((entry) => (
            <AccordionItem key={entry.id} value={entry.id}>
              <AccordionTrigger>{entry.question}</AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2 t-body">{entry.answer}</div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Card>

      <Callout
        tone="brand"
        title="Still stuck"
        action={
          <Button variant="secondary" asChild>
            <Link href="/portal/teacher/profile">Your profile</Link>
          </Button>
        }
      >
        The school office holds the records this portal reads from — your staff
        details, your classes, the term and who may publish. Anything an answer
        above hands over to them starts there.
      </Callout>
    </div>
  );
}
