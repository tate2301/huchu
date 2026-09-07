"use client";

import Link from "next/link";
import { Button } from "@corelithzw/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";
import { ChevronDown, Plus } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

type NewActionItem =
  | { label: string; icon: LucideIcon; href: string; onClick?: never }
  | { label: string; icon: LucideIcon; onClick: () => void; href?: never };

type AccountingNewButtonProps = {
  label?: string;
  items: NewActionItem[];
  className?: string;
};

export function AccountingNewButton({
  label = "New",
  items,
  className,
}: AccountingNewButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={cn("gap-1.5", className)}>
          <Plus className="size-4" />
          {label}
          <ChevronDown className="size-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {items.map((item) =>
          item.href ? (
            <DropdownMenuItem key={item.label} asChild>
              <Link href={item.href} className="flex items-center gap-2.5">
                <item.icon className="size-4 text-muted-foreground" />
                {item.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={item.label}
              onClick={item.onClick}
              className="flex items-center gap-2.5"
            >
              <item.icon className="size-4 text-muted-foreground" />
              {item.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
