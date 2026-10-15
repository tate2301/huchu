import type { z } from "zod";

import { bulkBody, bulkRoute, type BulkOutcome } from "@/lib/admin/bulk";
import { AdminRefusal } from "@/lib/admin/refusal";
import type { SignedInOperator } from "@/lib/operators/guards";
import type { OperatorAction } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

type Workspace = { id: string; name: string };

/**
 * A bulk action inside one workspace (`/api/platform-admin/features/[slug]/…`):
 * the ticked ids are that workspace's verticals, bundles or features, and the
 * workspace is the address's, never the body's.
 */
export function workspaceBulk<B extends z.ZodTypeAny = typeof bulkBody>(
  permission: OperatorAction,
  run: (operator: SignedInOperator, workspace: Workspace, body: z.infer<B>) => Promise<BulkOutcome>,
  schema?: B,
) {
  return async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    return bulkRoute(
      permission,
      async (operator, body: z.infer<B>) => {
        const workspace = await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true } });
        if (!workspace) throw new AdminRefusal("That workspace no longer exists.");
        return run(operator, workspace, body);
      },
      schema,
    )(request);
  };
}
