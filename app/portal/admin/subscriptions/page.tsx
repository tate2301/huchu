import { redirect } from "next/navigation";

export default function AdminSubscriptionsRoute() {
  redirect("/admin/commercial?view=subscriptions");
}
