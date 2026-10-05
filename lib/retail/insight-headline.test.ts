import { describe, expect, it } from "vitest";

import {
  customersHeadline,
  headlineMoney,
  lossesHeadline,
  moneyHeadline,
  productsHeadline,
  profitHeadline,
  salesHeadline,
  stockHeadline,
  type HeadlineWords,
} from "./insight-headline";
import { insightWindow } from "./insights";

const at = new Date("2026-10-03T12:42:00Z");
const thirty: HeadlineWords = insightWindow("30d", at);
const today: HeadlineWords = insightWindow("today", at);
const month: HeadlineWords = insightWindow("month", at);

const sales = {
  words: thirty,
  takings: 11_732.4,
  baskets: 1_204,
  takingsBefore: 14_135,
  change: -0.17,
  site: null,
  tradedAt: ["Borrowdale", "Harare Main Branch"],
  busiest: { day: "Fri", hour: "17" },
  growing: { name: "Ciders and coolers", change: 0.12 },
};

describe("the window's words for a headline", () => {
  it("closes the fact and names the period before", () => {
    expect([thirty.over, thirty.beforeWords]).toEqual(["in the last 30 days", "the 30 days before"]);
    expect([today.over, today.beforeWords]).toEqual(["today", "the day before"]);
    expect([month.over, month.beforeWords]).toEqual(["this month", "the month before"]);
  });

  it("writes money whole from a hundred dollars, in cents below it", () => {
    expect(headlineMoney(11_732.4)).toBe("US$11,732");
    expect(headlineMoney(42.5)).toBe("US$42.50");
    expect(headlineMoney(-310.2)).toBe("US$310");
  });
});

describe("Sales headline", () => {
  it("states what was taken, then the busiest hour and the change on before", () => {
    expect(salesHeadline(sales)).toEqual({
      fact: "US$11,732 taken in the last 30 days across two shops.",
      notice: "Fri 17:00 is the busiest hour; takings are 17% down on the 30 days before.",
    });
  });

  it("names the one site it reads, and says nothing of shops for a business with one", () => {
    expect(salesHeadline({ ...sales, site: "Borrowdale", tradedAt: [] }).fact).toBe("US$11,732 taken in the last 30 days at Borrowdale.");
    expect(salesHeadline({ ...sales, tradedAt: [] }).fact).toBe("US$11,732 taken in the last 30 days.");
  });

  it("says which shop took it all when only one of several traded", () => {
    expect(salesHeadline({ ...sales, tradedAt: ["Harare Main Branch"] }).fact).toBe(
      "US$11,732 taken in the last 30 days, all at Harare Main Branch.",
    );
    expect(salesHeadline({ ...sales, words: today, takings: 94.5, baskets: 6, tradedAt: ["Harare Main Branch"] }).fact).toBe(
      "US$94.50 taken today from 6 sales, all at Harare Main Branch.",
    );
  });

  it("leaves the weekday off today's busiest hour, and says when takings held level", () => {
    expect(salesHeadline({ ...sales, words: today, change: 0.002 }).notice).toBe(
      "17:00 is the busiest hour; takings are level with the day before.",
    );
  });

  it("names the category that grew when there is nothing fair to compare the takings with", () => {
    expect(salesHeadline({ ...sales, change: null }).notice).toBe(
      "Fri 17:00 is the busiest hour; Ciders and coolers grew 12% on the 30 days before.",
    );
  });

  it("says so in a sentence when nothing sold", () => {
    expect(salesHeadline({ ...sales, words: today, takings: 0, baskets: 0, takingsBefore: 640 })).toEqual({
      fact: "No sales yet today.",
      notice: "The day before took US$640.",
    });
    expect(salesHeadline({ ...sales, takings: 0, baskets: 0, takingsBefore: 0, site: "Borrowdale" })).toEqual({
      fact: "No sales at Borrowdale in the last 30 days.",
      notice: "Nothing sold in the 30 days before either.",
    });
  });

  it("says too few sold to compare, and to widen the period where it can be widened", () => {
    expect(salesHeadline({ ...sales, words: today, takings: 42.5, baskets: 3 })).toEqual({
      fact: "US$42.50 taken today across two shops from 3 sales.",
      notice: "Too few sales in these dates to compare. Widen the period.",
    });
    expect(salesHeadline({ ...sales, takings: 120, baskets: 1, tradedAt: [] })).toEqual({
      fact: "US$120 taken in the last 30 days from 1 sale.",
      notice: "Too few sales in these dates to compare.",
    });
  });
});

describe("Profit headline", () => {
  const profit = {
    words: thirty,
    profit: 3_210.55,
    margin: 0.2414,
    revenue: 13_300,
    baskets: 1_204,
    profitBefore: 2_870,
    change: 0.118,
    below: { label: "Spirits", margin: 0.182, target: 0.25 },
    worst: { name: "Castle Lite 340ml", margin: 0.031 },
    best: { label: "Wine", margin: 0.36 },
  };

  it("states the profit and margin, then the category below its aim and the change", () => {
    expect(profitHeadline(profit)).toEqual({
      fact: "US$3,211 gross profit in the last 30 days, 24.1% of sales.",
      notice: "Spirits earns 18.2%, below the 25% you aim for; profit is 12% up on the 30 days before.",
    });
  });

  it("falls back to the product that earns least when every category meets its aim", () => {
    expect(profitHeadline({ ...profit, below: null, change: null }).notice).toBe(
      "Castle Lite 340ml earns the least, 3.1%; Wine earns the best margin, 36.0%.",
    );
  });

  it("reads as a sentence with nothing or too little sold", () => {
    expect(profitHeadline({ ...profit, words: month, profit: 0, revenue: 0, baskets: 0 })).toEqual({
      fact: "No sales yet this month.",
      notice: "The month before made US$2,870 gross profit.",
    });
    expect(profitHeadline({ ...profit, words: today, baskets: 4 }).notice).toBe("Too few sales in these dates to compare. Widen the period.");
  });
});

describe("Products headline", () => {
  const products = { words: thirty, products: 320, selling: 214, idle: { count: 38, value: 4_210 }, top20: 0.64, out: 12 };

  it("states how many products sold, then the cash sitting idle and the top 20's share", () => {
    expect(productsHeadline(products)).toEqual({
      fact: "214 of 320 products sold in the last 30 days.",
      notice: "US$4,210 is sitting in 38 products not sold in 60 days; the top 20 make 64% of the profit.",
    });
  });

  it("reads as a sentence when nothing sold or nothing is stocked", () => {
    expect(productsHeadline({ ...products, words: today, selling: 0, idle: { count: 0, value: 0 }, top20: null, out: 1 })).toEqual({
      fact: "None of the 320 products sold today.",
      notice: "1 product is out of stock.",
    });
    expect(productsHeadline({ ...products, products: 0 }).fact).toBe("No products on the shelf yet.");
    expect(productsHeadline({ ...products, selling: 19, products: 21, idle: { count: 0, value: 0 }, top20: null, out: 0 }).notice).toBe(
      "2 products sold nothing in the last 30 days.",
    );
  });
});

describe("Stock headline", () => {
  const stock = {
    words: thirty,
    value: 48_200,
    cover: 34.4,
    baskets: 1_204,
    aim: 14,
    short: { label: "Beer", cover: 6.2 },
    heavy: { label: "Wine", cover: 120, value: 9_800 },
    low: 9,
    missed: { value: 320, product: null },
  };

  it("states the stock and its cover, then the shortest category and what empty shelves cost", () => {
    expect(stockHeadline(stock)).toEqual({
      fact: "US$48,200 of stock at cost, about 34 days of cover.",
      notice: "Beer has 6 days of cover against the 14 you aim for; about US$320 of sales were missed with shelves empty.",
    });
    expect(stockHeadline({ ...stock, short: null, missed: { value: 85, product: "Castle Lite 340ml" } }).notice).toBe(
      "About US$85.00 of sales were missed with Castle Lite 340ml empty; 9 products are at or below the reorder level.",
    );
  });

  it("will not measure cover on too few sales", () => {
    expect(stockHeadline({ ...stock, words: today, cover: null, baskets: 0 })).toEqual({
      fact: "US$48,200 of stock at cost; nothing sold today.",
      notice: "Too few sales in these dates to measure cover. Widen the period.",
    });
    expect(stockHeadline({ ...stock, words: today, baskets: 3 })).toEqual({
      fact: "US$48,200 of stock at cost.",
      notice: "Too few sales in these dates to measure cover. Widen the period.",
    });
  });
});

describe("Losses headline", () => {
  const losses = {
    words: thirty,
    total: 412,
    takings: 34_918,
    baskets: 3_862,
    change: 0.21,
    biggest: { label: "drawer differences", value: 210 },
    shortest: { name: "Tendai Moyo", times: 3, value: 45 },
  };

  it("states what was lost against takings, then where most of it went and the change", () => {
    expect(lossesHeadline(losses)).toEqual({
      fact: "US$412 lost in the last 30 days, 1.2% of takings.",
      notice: "Most of it is drawer differences, US$210; losses are 21% up on the 30 days before.",
    });
  });

  it("says all of it when one kind is the whole, and leaves out a change under 10%", () => {
    expect(lossesHeadline({ ...losses, change: 0.04, biggest: { label: "refunds and voids", value: 412 } }).notice).toBe(
      "All of it is refunds and voids, US$412; Tendai Moyo was short 3 times, US$45.00 in all.",
    );
  });

  it("leaves out the comparison with the period before on too few sales", () => {
    expect(
      lossesHeadline({ ...losses, words: today, total: 1, takings: 94.5, baskets: 6, change: -0.91, biggest: { label: "stock counts", value: 1 }, shortest: null }),
    ).toEqual({
      fact: "US$1.00 lost today, 1.1% of takings.",
      notice: "All of it is stock counts, US$1.00.",
    });
  });

  it("says nothing was lost in a sentence", () => {
    expect(lossesHeadline({ ...losses, words: today, total: 0 })).toEqual({
      fact: "Nothing lost today.",
      notice: "No count differences, short drawers, refunds or voids.",
    });
  });
});

describe("Customers headline", () => {
  const customers = { words: thirty, takings: 34_918, baskets: 3_862, takingsBefore: 30_000, memberShare: 0.34, ratio: 2.4, lapsed: 12, cameBack: 40 };

  it("states the members' share, then what a member spends and who has lapsed", () => {
    expect(customersHeadline(customers)).toEqual({
      fact: "Members brought in 34% of takings in the last 30 days.",
      notice: "Members spend 2.4 times what a walk-in does a visit; 12 members have not been in for 30 days.",
    });
  });

  it("reads as a sentence with no members, no sales or too few", () => {
    expect(customersHeadline({ ...customers, memberShare: 0, ratio: null }).fact).toBe("Every sale in the last 30 days was a walk-in.");
    expect(customersHeadline({ ...customers, ratio: 1.04 }).notice).toBe(
      "Members spend about what a walk-in does a visit; 12 members have not been in for 30 days.",
    );
    expect(customersHeadline({ ...customers, words: today, takings: 0, baskets: 0, takingsBefore: 0 })).toEqual({
      fact: "No sales yet today.",
      notice: "Nothing sold the day before either.",
    });
    expect(customersHeadline({ ...customers, words: today, baskets: 2 }).notice).toBe("Too few sales in these dates to compare. Widen the period.");
  });
});

describe("Money headline", () => {
  const money = { words: thirty, in: 40_100, out: 27_700, waiting: 3, heaviestWeek: "14 Sept", onOrder: 2_300 };

  it("states what came in over what went out, then what waits for a decision", () => {
    expect(moneyHeadline(money)).toEqual({
      fact: "US$12,400 more came in than went out in the last 30 days.",
      notice: "3 requisitions are waiting for a decision; the week of 14 Sept spent more than it took.",
    });
  });

  it("says when spending ran ahead, and when nothing moved", () => {
    expect(moneyHeadline({ ...money, in: 1_000, out: 2_200, waiting: 0 })).toEqual({
      fact: "Spending ran US$1,200 ahead of takings in the last 30 days.",
      notice: "The week of 14 Sept spent more than it took; US$2,300 is on order from suppliers.",
    });
    expect(moneyHeadline({ ...money, words: today, in: 0, out: 0, waiting: 0, heaviestWeek: null, onOrder: 0 })).toEqual({
      fact: "No money came in or went out today.",
      notice: "Nothing is waiting to be paid or delivered.",
    });
  });
});
