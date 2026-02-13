"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type WorkflowStepProps = {
  title: string;
  description?: string;
  badge?: string | number;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function WorkflowStep({
  title,
  description,
  badge,
  actions,
  children,
  className,
}: WorkflowStepProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{title}</CardTitle>
            {badge !== undefined && (
              <Badge variant="secondary" className="rounded-md">
                {badge}
              </Badge>
            )}
          </div>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
