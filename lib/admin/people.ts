import { findLastSignInByEmail } from "@/lib/auth-core/last-sign-in";
import { roleLabel } from "@/lib/admin/members";
import { prisma } from "@/lib/prisma";

/**
 * Finding a person when all you have is what they told you: a name, an email
 * or a phone number, and no idea which workspace they are in.
 */
export async function findPeople(q: string, take = 50) {
  const term = q.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term.toLowerCase() } },
        ...(digits.length >= 4 ? [{ phone: { contains: digits.slice(-9) } }] : []),
      ],
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    take,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      companyId: true,
      company: { select: { slug: true, name: true } },
    },
  });
  const lastByCompany = new Map<string, Map<string, Date>>();
  for (const companyId of new Set(users.map((user) => user.companyId))) {
    const emails = users.flatMap((user) => (user.companyId === companyId && user.email ? [user.email] : []));
    lastByCompany.set(companyId, await findLastSignInByEmail({ companyId, emails }));
  }
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    roleLabel: roleLabel(user.role),
    isActive: user.isActive,
    workspace: user.company,
    lastSignInAt: user.email ? (lastByCompany.get(user.companyId)?.get(user.email.toLowerCase()) ?? null) : null,
  }));
}

export type PersonRow = Awaited<ReturnType<typeof findPeople>>[number];
