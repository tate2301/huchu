"use client";

import Link from "next/link";
import {
  Badge,
  Button,
  Callout,
  Card,
  DetailView,
  EmptyState,
  RowCard,
  StatCard,
  Tag,
} from "@corelithzw/react";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { useTeacherPortal } from "./teacher-portal-context";

/**
 * Fields a teacher cannot change here, and the reason each one is somebody
 * else's to change.
 *
 * The demo answers this with an "Edit profile" button that raises a toast
 * saying the edit is pending admin approval — a control that looks live and
 * does nothing. A staff record is the office's record: the staff code is
 * issued with the contract, the email is the sign-in identity, and the job
 * title comes off the employee record HR keeps. Naming the owner is more
 * useful than a disabled input, and it is honest about who to ask.
 */
const OFFICE_OWNED = [
  {
    field: "Name",
    owner: "School office",
    why: "It appears on registers, mark sheets and anything sent to parents, so it follows the staff record rather than a portal edit.",
  },
  {
    field: "Staff code",
    owner: "School office",
    why: "Issued once with your employment record and used to tie your account to it.",
  },
  {
    field: "Email",
    owner: "School office",
    why: "It is how you sign in. Changing it changes the account, which is an administrator's job.",
  },
  {
    field: "Job title",
    owner: "Human resources",
    why: "Read from the employee record. It also decides some of what this portal lets you do.",
  },
  {
    field: "Photograph",
    owner: "School office",
    why: "Set on your account. Without one, your initials stand in wherever you are listed.",
  },
  {
    field: "Classes and subjects",
    owner: "School office",
    why: "Teaching assignments are made per term against the timetable. They end when the term does.",
  },
];

/**
 * Who the teacher is, as the school holds it.
 *
 * Everything on this screen is already in hand — the portal layout loads the
 * teacher's day on the server and the provider hands it down — so there is no
 * fetch, no skeleton and no empty first paint. The one state worth rendering
 * is the account that was never linked to a staff record, because that is a
 * real condition with a real next step.
 *
 * The demo pads the page out with a career: qualifications, council
 * certificate, CPD points, periods taught this year. None of that is stored
 * anywhere in this product, so inventing a card of it would be inventing the
 * record. What is real is the teaching load — the classes, the subjects and
 * the pupils behind them — and that is what the page is built around.
 */
export function TeacherProfileScreen() {
  const { day } = useTeacherPortal();

  const teacher = day.teacher;
  const classes = day.classes;

  if (!teacher) {
    return (
      <EmptyState
        title="You are not linked to a teacher profile"
        body="Ask the school office to link your account to your staff record. Until then there is no profile to show."
      />
    );
  }

  const name = teacher.user.name ?? "Unnamed staff member";
  const jobTitle = teacher.employee?.jobTitle ?? "Teacher";
  const subjects = [...new Set(classes.map((row) => row.subjectName))];
  const pupils = classes.reduce((total, row) => total + row.size, 0);
  const lessonsToday = day.periods.filter((period) => period.lesson).length;

  return (
    <DetailView
      factsTitle="Contact"
      facts={[
        {
          label: "Staff code",
          value: teacher.employeeCode ?? "Not issued",
          mono: Boolean(teacher.employeeCode),
        },
        { label: "Email", value: teacher.user.email, mono: true },
        { label: "Job title", value: jobTitle },
        { label: "Term", value: day.term?.name ?? "No term running" },
      ]}
      sections={[
        {
          id: "load",
          title: "Teaching load",
          description: day.term
            ? `${day.term.name} · assignments run to the end of the term`
            : "No term is running, so no classes are assigned",
          content:
            classes.length === 0 ? (
              <EmptyState
                title="No classes are assigned to you"
                body="The office assigns classes and subjects per term against the timetable. Ask them to add yours."
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="t-caption">Subjects</span>
                  {subjects.map((subject) => (
                    <Tag key={subject} accent="auto">
                      {subject}
                    </Tag>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  {classes.map((row) => (
                    <RowCard
                      key={row.classSubjectId}
                      title={`${row.className}${row.streamName ? ` ${row.streamName}` : ""} · ${row.subjectName}`}
                      subtitle={`${row.classCode} · ${row.subjectCode}`}
                      status={
                        <span className="t-mono tabular-nums">
                          {row.size} pupil{row.size === 1 ? "" : "s"}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            ),
        },
        {
          id: "owned",
          title: "Held by the school office",
          description: "These are read-only here. Ask the office to change them.",
          content: (
            <div className="flex flex-col gap-4">
              <ul className="flex list-none flex-col gap-3 p-0">
                {OFFICE_OWNED.map((row) => (
                  <li key={row.field} className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="t-label-sm">{row.field}</span>
                      <Badge tone="outline">{row.owner}</Badge>
                    </span>
                    <span className="t-caption">{row.why}</span>
                  </li>
                ))}
              </ul>
              <Callout tone="info" title="Something here is wrong">
                Send the office the correction rather than working around it. A
                register, a mark sheet and a parent message all read the same
                staff record, so fixing it once fixes it everywhere.
              </Callout>
            </div>
          ),
        },
      ]}
      aside={
        <>
          <Card>
            <div className="flex flex-col items-start gap-3">
              <PersonAvatar name={name} src={teacher.user.image} size="lg" />
              <div className="flex flex-col gap-1">
                <span className="t-body-lg">{name}</span>
                <span className="t-caption">{jobTitle}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {teacher.employeeCode ? (
                  <Badge tone="neutral">{teacher.employeeCode}</Badge>
                ) : null}
                {day.term ? <Badge tone="info">{day.term.name}</Badge> : null}
              </div>
              <Button variant="secondary" asChild>
                <Link href="/portal/teacher/settings">Settings</Link>
              </Button>
            </div>
          </Card>

          <Card
            title="This term"
            footer={
              <span className="t-caption">
                {lessonsToday} lesson{lessonsToday === 1 ? "" : "s"} on today&apos;s
                timetable
              </span>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Classes" value={classes.length} />
              <StatCard label="Pupils" value={pupils} />
              <StatCard label="Subjects" value={subjects.length} />
            </div>
          </Card>
        </>
      }
    />
  );
}
