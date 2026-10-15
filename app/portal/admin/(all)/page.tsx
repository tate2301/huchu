import { MoneyFigures } from "@/components/admin/home/money-figures";
import { ProjectionChart, VerticalMixChart } from "@/components/admin/home/money-charts";
import { QueueList } from "@/components/admin/home/queue-list";
import { UrlTabs } from "@/components/admin/list-controls";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { homeFigures, loadProjectionRows, mixByVertical, projectMonths } from "@/lib/admin/projections";
import { homeQueue } from "@/lib/admin/queue";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

export const metadata = { title: "Home · Corelith admin" };

const KINDS = { money: "Money", access: "Access", setup: "Setup" } as const;

/**
 * Home: the money across every workspace, then what waits on Corelith staff,
 * oldest money first. The figures are the portal's overview; the queue is the
 * work.
 */
export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [{ tab }, operator] = await Promise.all([searchParams, requireOperator()]);
  const now = new Date();
  const [items, rows] = await Promise.all([
    homeQueue({ includeOperators: operatorCan(operator.role, "operator.manage") }, now),
    loadProjectionRows(now),
  ]);
  const kind = tab && tab in KINDS ? KINDS[tab as keyof typeof KINDS] : null;
  const shown = kind ? items.filter((item) => item.kind === kind) : items;
  return (
    <AdminPage>
      <AdminPageHeader title="Home" />
      <div className="space-y-6 pb-8">
        <MoneyFigures figures={homeFigures(rows, now)} />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <ProjectionChart
            months={projectMonths(rows, now).map((month) => ({ ...month, monthStart: month.monthStart.toISOString() }))}
          />
          <VerticalMixChart mix={mixByVertical(rows)} />
        </div>
      </div>
      <h2 className="t-section text-[var(--ink)]">What waits on staff</h2>
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
