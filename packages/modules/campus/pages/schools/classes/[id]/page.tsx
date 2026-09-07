import { redirect } from "next/navigation";

/**
 * A class record moved with its list. The id is kept through the redirect so
 * an existing link to one class still lands on that class.
 */
export default async function ClassRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/management/master-data/schools/classes/${id}`);
}
