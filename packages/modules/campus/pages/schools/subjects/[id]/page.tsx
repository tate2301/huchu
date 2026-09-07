import { redirect } from "next/navigation";

/**
 * A subject record moved with its list. The id is kept through the redirect so
 * an existing link to one subject still lands on that subject.
 */
export default async function SubjectRecordRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/management/master-data/schools/subjects/${id}`);
}
