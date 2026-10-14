import "../../themes/admin.css";
import { requireOperator } from "@/lib/operators/guards";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireOperator();
  return <div data-portal="admin">{children}</div>;
}
