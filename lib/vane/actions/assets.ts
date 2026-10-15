import { z } from "zod";

import { deleteVaneDraftWorkOrder, raiseWorkOrder, WorkOrderRefused } from "@/lib/maintenance/work-orders";

import { refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

type Params = { workOrderId: string; equipment: string; issue: string };

const params = z.object({
  workOrderId: z.string().min(1),
  equipment: z.string().min(1).max(120).describe('As the equipment list names it: "Mill 1 feed pump, P-104".'),
  issue: z.string().min(1).max(200),
});

const raise = {
  kind: "assets.work_order.raise",
  module: "assets",
  description: "Raise a work order Vane drafted (the draft tool, work_order), once the person has checked it: it opens, and the workshop is told.",
  params,
  fields: [],
  verb: () => "Raise the work order",
  title: (p) => `Raise the work order for ${p.equipment}: ${p.issue}`,
  target: (p) => `/maintenance/work-orders/${p.workOrderId}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/work-orders"),
  async run(context, p) {
    try {
      const order = await raiseWorkOrder({ companyId: context.companyId, userId: context.userId, role: context.role }, p.workOrderId);
      return `The work order for ${order.equipment.name} is raised. The workshop has been told.`;
    } catch (error) {
      if (error instanceof WorkOrderRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<Params>;

const discard = {
  kind: "assets.work_order.discard",
  module: "assets",
  description: "Delete a work order Vane drafted that nobody raised, when it is not wanted.",
  params,
  fields: [],
  verb: () => "Delete the draft",
  title: (p) => `Delete Vane's draft work order for ${p.equipment}`,
  target: (p) => `/maintenance/work-orders/${p.workOrderId}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/work-orders"),
  async run(context, p) {
    try {
      await deleteVaneDraftWorkOrder(context.companyId, p.workOrderId);
      return `The draft for ${p.equipment} is deleted.`;
    } catch (error) {
      if (error instanceof WorkOrderRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<Params>;

export const ASSETS_ACTIONS = [raise, discard] as const;
