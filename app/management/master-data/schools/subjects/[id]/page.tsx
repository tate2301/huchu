import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

import { SubjectsRegister } from "../subjects-register";

/**
 * One subject, as a record, with the catalogue still beside it.
 *
 * The session gate is untouched.
 */
export default async function SubjectRecordMasterDataRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <SubjectsRegister selectedId={id} />;
}
