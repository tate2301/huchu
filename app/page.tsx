import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { navSections } from "@/lib/navigation";

type DashboardTileProps = {
  href: string;
  icon: LucideIcon;
  label: string;
};

function DashboardTile({ href, icon: Icon, label }: DashboardTileProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span className="font-semibold">{label}</span>
      <ArrowRight className="size-5 text-muted-foreground ml-auto" />
    </Link>
  );
}

export default function Home() {
  const groupedSections = navSections.filter(
    (section) => section.id !== "overview",
  );

  return (
    <div className="space-y-8">
      <PageActions>
        <Link href="/shift-report">
          <Button size="sm">
            <ClipboardList className="h-4 w-4" />
            New Shift Report
          </Button>
        </Link>
        <Link href="/attendance">
          <Button size="sm" variant="outline">
            <Users className="h-4 w-4" />
            Take Attendance
          </Button>
        </Link>
      </PageActions>

      <PageHeading
        title="Huchu Enterprises"
        description="Mine Operations System"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Active Sites
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">5</div>
            <p className="text-xs text-muted-foreground mt-1">
              All operational
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Today's Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Pending submission
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              Gold Poured (Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">0g</div>
            <p className="text-xs text-muted-foreground mt-1">No pours yet</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-green-600">OK</div>
            <p className="text-xs text-muted-foreground mt-1">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {groupedSections.map((group) => (
          <Card key={group.id}>
            <CardHeader className="pb-2">
              <CardTitle className="font-semibold">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {group.items.map((item) => (
                <DashboardTile key={item.href} {...item} />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
