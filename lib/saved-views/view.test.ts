import { describe, expect, it } from "vitest";

import { canChangeView, currentView, orderViews, viewHref, viewPath, viewQuery } from "@/lib/saved-views/view";

describe("a saved view's address", () => {
  it("keeps the page without its query, and only paths inside the app", () => {
    expect(viewPath("/books/invoices?show=overdue#top")).toBe("/books/invoices");
    expect(viewPath("/books/invoices/")).toBe("/books/invoices");
    expect(viewPath("https://example.com/books")).toBeNull();
    expect(viewPath("//example.com/books")).toBeNull();
    expect(viewPath("")).toBeNull();
  });

  it("keeps the list's query and drops what was only open at the time", () => {
    expect(viewQuery("?show=overdue&customer=&sheet=invoice-new&page=3&q=pomona")).toBe("show=overdue&q=pomona");
    expect(viewQuery(null)).toBe("");
  });

  it("opens on its page with its query", () => {
    expect(viewHref({ path: "/books/invoices", query: "show=overdue" })).toBe("/books/invoices?show=overdue");
    expect(viewHref({ path: "/books/invoices", query: "" })).toBe("/books/invoices");
  });

  it("is the view being looked at when the page and the list's query match", () => {
    const views = [
      { id: "a", path: "/books/invoices", query: "show=overdue" },
      { id: "b", path: "/books/invoices", query: "" },
    ];
    expect(currentView(views, "/books/invoices", "?show=overdue&page=2")?.id).toBe("a");
    expect(currentView(views, "/books/invoices", "")?.id).toBe("b");
    expect(currentView(views, "/books", "")).toBeNull();
  });
});

describe("who may change a saved view", () => {
  it("is whoever saved it, or a manager once it is shared", () => {
    const own = { createdById: "u1", isShared: false };
    const shared = { createdById: "u1", isShared: true };
    expect(canChangeView(own, { id: "u1", role: "CLERK" })).toBe(true);
    expect(canChangeView(own, { id: "u2", role: "MANAGER" })).toBe(false);
    expect(canChangeView(shared, { id: "u2", role: "MANAGER" })).toBe(true);
    expect(canChangeView(shared, { id: "u2", role: "CLERK" })).toBe(false);
  });

  it("lists yours first, then the shared ones, A to Z", () => {
    const views = [
      { name: "Paid this month", mine: false },
      { name: "Pomona Offices", mine: true },
      { name: "Overdue", mine: false },
    ];
    expect(orderViews(views).map((view) => view.name)).toEqual(["Pomona Offices", "Overdue", "Paid this month"]);
  });
});
