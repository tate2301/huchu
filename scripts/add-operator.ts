import "dotenv/config";
import { parseArgs } from "node:util";

import type { OperatorRole } from "@prisma/client";

import { getAdminPortalHost } from "@/lib/admin-portal";
import { prisma } from "@/lib/prisma";
import { inviteOperator } from "@/lib/operators/manage";

/**
 * The first owner, before there is anyone to invite them.
 *
 *   pnpm operator:add --email tafadzwa@corelith.co.zw --name "Tafadzwa Mhlanga" --role owner
 *
 * Prints the invite link, which works once, for three days: the operator
 * chooses a password there and sets up their authenticator. Everyone after the
 * first owner is invited from the portal's Operators page.
 */

const ROLES: Record<string, OperatorRole> = { owner: "OWNER", support: "SUPPORT", billing: "BILLING" };

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "owner" } },
  });
  const role = ROLES[values.role?.trim().toLowerCase() ?? ""];
  if (!values.email || !values.name || !role) {
    throw new Error('Usage: pnpm operator:add --email <email> --name "<name>" --role owner|support|billing');
  }
  const { operator, token } = await inviteOperator(null, { name: values.name, email: values.email, role });
  const scheme = process.env.NODE_ENV === "production" ? "https" : "http";
  console.log(`Invited ${operator.name} <${operator.email}> as ${values.role}.`);
  console.log(`Their link, good once for three days: ${scheme}://${getAdminPortalHost()}/admin/login/invite?token=${token}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
