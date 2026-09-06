"use client";

import { useMemo } from "react";
import { ListView } from "@rtcamp/frappe-ui-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "@/lib/icons";

export type HubLinkItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  tag?: string;
};

export type HubLinkGroup = {
  group: string;
  items: HubLinkItem[];
};

type GroupedLinkListProps = {
  groups: HubLinkGroup[];
  emptyTitle?: string;
};

export function GroupedLinkList({
  groups,
  emptyTitle = "No links available.",
}: GroupedLinkListProps) {
  const router = useRouter();

  const groupedRows = useMemo(
    () =>
      groups.map((group) => ({
        group: group.group,
        rows: group.items,
      })),
    [groups],
  );

  return (
    <ListView
      columns={[
        { key: "label", label: "Destination", width: "260px", align: "left" },
        { key: "description", label: "Description", align: "left" },
        { key: "tag", label: "Group", width: "120px", align: "left" },
      ]}
      rows={groupedRows}
      rowKey="id"
      options={{
        emptyState: {
          title: emptyTitle,
          description: "",
        },
        options: {
          selectable: false,
          showTooltip: false,
          rowHeight: 46,
          onRowClick: (row) => {
            const href = (row as HubLinkItem).href;
            if (href) router.push(href);
          },
        },
        slots: {
          cell: ({ row, column }) => {
            const item = row as HubLinkItem;
            if (column.key === "label") {
              return (
                <div className="flex items-center gap-2 font-medium text-primary">
                  <span>{item.label}</span>
                  <ArrowRight className="size-4" />
                </div>
              );
            }
            if (column.key === "description") {
              return <span className="text-muted-foreground">{item.description}</span>;
            }
            if (column.key === "tag") {
              return item.tag ? <Badge variant="outline">{item.tag}</Badge> : "";
            }
            return "";
          },
        },
      }}
    />
  );
}
