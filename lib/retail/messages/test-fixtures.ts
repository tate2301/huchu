import { prisma } from "@/lib/prisma";
import { testSale } from "@/lib/retail/loyalty/test-fixtures";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

/**
 * Test setup only (CUS-06): a shop whose customers cover every audience rule.
 * Gold is US$1,500 in 12 months (the default tiers); a lapsed customer last
 * came 40 days ago; one never came.
 */

const DAY_MS = 86_400_000;

export type MessageShop = TestShop & {
  /** Gold, agreed, a number, here today. */
  gold: string;
  goldNoConsent: string;
  goldNoNumber: string;
  goldBinned: string;
  /** Last came 40 days ago, agreed. */
  lapsed: string;
  /** Agreed, never came. */
  never: string;
  /** Agreed, a WhatsApp number and no phone. */
  whatsappOnly: string;
};

let numbers = 0;
const nextNumber = () => {
  numbers += 1;
  return `+26377${String(Date.now() % 100_000).padStart(5, "0")}${String(numbers % 100).padStart(2, "0")}`;
};

export async function messageShop(label: string): Promise<MessageShop> {
  const shop = await makeTestShop(label);
  const customer = async (
    name: string,
    input: { consent: boolean; phone?: string | null; whatsapp?: string | null; binned?: boolean; spend?: string; at?: Date },
  ) => {
    const id = (
      await prisma.customer.create({
        data: {
          companyId: shop.companyId,
          name,
          phone: input.phone === undefined ? nextNumber() : input.phone,
          whatsapp: input.whatsapp ?? null,
          marketingConsent: input.consent,
          archivedAt: input.binned ? new Date() : null,
        },
        select: { id: true },
      })
    ).id;
    if (input.spend) await testSale(shop, { total: input.spend, customerId: id, postedAt: input.at });
    return id;
  };
  return {
    ...shop,
    gold: await customer("Tapiwa Marange", { consent: true, spend: "1600.00" }),
    goldNoConsent: await customer("Nyasha Gwenzi", { consent: false, spend: "1600.00" }),
    goldNoNumber: await customer("Rutendo Banda", { consent: true, phone: null, spend: "1600.00" }),
    goldBinned: await customer("Munashe Chari", { consent: true, binned: true, spend: "1600.00" }),
    lapsed: await customer("Blessing Ncube", { consent: true, spend: "50.00", at: new Date(Date.now() - 40 * DAY_MS) }),
    never: await customer("Kudzai Zhou", { consent: true }),
    whatsappOnly: await customer("Simba Mutasa", { consent: true, phone: null, whatsapp: nextNumber() }),
  };
}
