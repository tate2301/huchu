import { QueueList } from "@/components/admin/home/queue-list";
import { UrlTabs } from "@/components/admin/list-controls";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { homeQueue } from "@/lib/admin/queue";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

export const metadata = { title: "Home · Corelith admin" };

const KINDS = { money: "Money", access: "Access", setup: "Setup" } as const;

/** What waits on Corelith staff, oldest money first. */
export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, operator] = await Promise.all([searchParams, requireOperator()]);
  const items = await homeQueue({ includeOperators: operatorCan(operator.role, "operator.manage") });
  const kind = tab && tab in KINDS ? KINDS[tab as keyof typeof KINDS] : null;
  const shown = kind ? items.filter((item) => item.kind === kind) : items;
  return (
    <AdminPage>
      <AdminPageHeader title="Home" />
      <UrlTabs
        label="What waits on staff"
        tabs={[
          { value: null, label: "Everything", count: items.length },
          ...Object.entries(KINDS).map(([value, label]) => ({ value, label, count: items.filter((item) => item.kind === label).length })),
        ]}
      />
      <div className="max-w-3xl pt-4">
        <QueueList items={shown} />
      </div>
    </AdminPage>
  );
}
