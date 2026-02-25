import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const helpTopics = [
  {
    id: "shift-report",
    title: "Shift Report",
    tips: [
      "Start with date, shift, and site before entering output values.",
      "Use the process stage field to only show the metrics you need.",
      "After submit, check the highlighted row in the report table.",
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    tips: [
      "Set date, shift, and site first, then mark each crew member.",
      "Use Present, Late, or Absent for every employee listed.",
      "After submit, filter the table by today's date to confirm records.",
    ],
  },
  {
    id: "plant-report",
    title: "Plant Report",
    tips: [
      "Capture production values before adding downtime events.",
      "Add downtime only when code and hours are known.",
      "After submit, verify the report appears in the date range table.",
    ],
  },
  {
    id: "stores",
    title: "Stock Receive and Issue",
    tips: [
      "Pick site and item first to avoid entry mistakes.",
      "Use notes to capture supplier and movement context.",
      "After submit, use the movement log row highlight to verify the record.",
    ],
  },
  {
    id: "gold",
    title: "Gold Control",
    tips: [
      "Record each sale against a batch; dispatch is optional when not needed.",
      "Required witness and handover fields prevent incomplete records.",
      "After submit, review the highlighted history row under each form.",
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeading
        title="Quick Tips"
        description="Simple guidance for each daily workflow."
      />
      <div className="grid gap-4">
        {helpTopics.map((topic) => (
          <Card key={topic.id} id={topic.id}>
            <CardHeader>
              <CardTitle>{topic.title}</CardTitle>
              <CardDescription>Follow these steps to avoid errors</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {topic.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
