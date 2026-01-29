import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Users,
  Factory,
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

type QuickActionProps = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  variant?: "primary" | "secondary";
};

function QuickAction({ href, icon: Icon, title, description, variant = "primary" }: QuickActionProps) {
  const isPrimary = variant === "primary";
  return (
    <Link href={href}>
      <Card className={`group cursor-pointer transition-all hover:shadow-lg border-2 ${
        isPrimary 
          ? "hover:border-primary bg-gradient-to-br from-primary/5 to-primary/10" 
          : "hover:border-border"
      }`}>
        <CardHeader className="pb-3">
          <div className={`h-12 w-12 rounded-lg flex items-center justify-center mb-3 ${
            isPrimary ? "bg-primary/10" : "bg-muted"
          }`}>
            <Icon className={`h-6 w-6 ${isPrimary ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <CardTitle className="text-lg flex items-center justify-between">
            {title}
            <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}

type ModuleTileProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  description?: string;
};

function ModuleTile({ href, icon: Icon, label, description }: ModuleTileProps) {
  return (
    <Link href={href}>
      <Card className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/50 h-full">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
              <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                {label}
              </h3>
              {description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {description}
                </p>
              )}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function Home() {
  const dailyOps = navSections.find((s) => s.id === "daily");
  const maintenance = navSections.find((s) => s.id === "maintenance");
  const stores = navSections.find((s) => s.id === "stores");
  const gold = navSections.find((s) => s.id === "gold");
  const management = navSections.find((s) => s.id === "management");

  return (
    <div className="space-y-8 max-w-7xl">
      <div>
        <PageHeading 
          title="Operations Dashboard" 
          description="Quick access to daily operations and key modules"
        />
      </div>

      {/* Priority Quick Actions */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-4 px-1">
          PRIORITY ACTIONS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickAction
            href="/shift-report"
            icon={ClipboardList}
            title="New Shift Report"
            description="Record production and incidents"
            variant="primary"
          />
          <QuickAction
            href="/attendance"
            icon={Users}
            title="Take Attendance"
            description="Log workforce presence"
            variant="primary"
          />
          <QuickAction
            href="/plant-report"
            icon={Factory}
            title="Plant Report"
            description="Document plant operations"
            variant="secondary"
          />
        </div>
      </section>

      {/* Core Operations Modules */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-4 px-1">
          CORE OPERATIONS
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Operations */}
          {dailyOps && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{dailyOps.title}</CardTitle>
                <CardDescription>{dailyOps.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {dailyOps.items.map((item) => (
                  <ModuleTile key={item.href} {...item} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Maintenance */}
          {maintenance && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{maintenance.title}</CardTitle>
                <CardDescription>{maintenance.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {maintenance.items.slice(0, 3).map((item) => (
                  <ModuleTile key={item.href} {...item} />
                ))}
                <Link href="/maintenance">
                  <Button variant="ghost" size="sm" className="w-full mt-2">
                    View All Maintenance
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Stores & Fuel */}
          {stores && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{stores.title}</CardTitle>
                <CardDescription>{stores.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {stores.items.slice(0, 3).map((item) => (
                  <ModuleTile key={item.href} {...item} />
                ))}
                <Link href="/stores">
                  <Button variant="ghost" size="sm" className="w-full mt-2">
                    View All Stores
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Gold Control */}
          {gold && (
            <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50/50 to-orange-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {gold.title}
                  <span className="text-xs font-normal text-muted-foreground">(High Security)</span>
                </CardTitle>
                <CardDescription>{gold.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {gold.items.slice(0, 3).map((item) => (
                  <ModuleTile key={item.href} {...item} />
                ))}
                <Link href="/gold">
                  <Button variant="ghost" size="sm" className="w-full mt-2">
                    View All Gold Operations
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Management & Compliance */}
      {management && (
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-4 px-1">
            MANAGEMENT & ANALYTICS
          </h2>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{management.title}</CardTitle>
              <CardDescription>{management.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {management.items.map((item) => (
                  <ModuleTile key={item.href} {...item} />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
