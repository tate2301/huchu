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
import { Separator } from "@/components/ui/separator";

type DashboardTileProps = {
  href: string;
  icon: LucideIcon;
  label: string;
};

function DashboardTile({ href, icon: Icon, label }: DashboardTileProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-md p-4 border border-border/70 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:border-border group"
    >
      <p className="flex rounded-md text-muted-foreground">
        <Icon className="h-5 w-5" />
      </p>
      <p className="group-hover: font-semibold group-hover:text-accent-foreground text-muted-foreground">
        {label}
      </p>
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

      <div className="grid gap-8">
        {groupedSections.map((group) => (
          <div key={group.id}>
            <h2 className="uppercase text-lg text-foreground font-bold mb-4 px-2">
              {group.title}
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-12">
              {group.items.map((item) => (
                <DashboardTile key={item.href} {...item} />
              ))}
            </div>
            <Separator />
          </div>
        ))}
      </div>
    </div>
  );
}
