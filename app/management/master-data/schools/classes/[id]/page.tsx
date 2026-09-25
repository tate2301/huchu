import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

import { ClassesRegister } from "../classes-register";

/**
 * One class, as a record — with the ladder still beside it.
 *
 * The same register the index renders; the id is which row is open. A record
 * that replaced the list would make going from Form 1 to Form 2 a trip back out
 * to a page that then has to be found again.
 *
 * The session gate is untouched.
 */
export default async function ClassRecordMasterDataRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return <ClassesRegister selectedId={id} />;
}
