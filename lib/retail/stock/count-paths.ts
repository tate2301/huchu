/**
 * The phone count (30-stock 5.7) is the counter's page, whatever their role:
 * a cashier asked to count opens it from their WhatsApp link. It stands
 * outside the shell like the till, and its nav item's grants do not gate it;
 * the page and its API ask the counter rule themselves.
 */
const COUNT_PHONE = /^\/retail\/stock\/counts\/[^/]+\/count\/?$/;

export const isCountPhonePath = (pathname: string) => COUNT_PHONE.test(pathname);
