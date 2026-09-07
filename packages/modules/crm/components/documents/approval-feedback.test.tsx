import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ApprovalFeedback } from "./document-list";

/**
 * What the customer did with a quote.
 *
 * The approval record has carried `firstViewedAt`, `respondedAt`,
 * `responderName` and `responseNote` since approval links shipped, and the
 * document list read none of them — the status chip said "Declined" and
 * stopped. These are the four states worth telling apart, because each one is
 * a different next move: nothing to chase, chase the email, chase the person,
 * or read what they said and re-quote.
 */
describe("ApprovalFeedback", () => {
  it("says nothing when the document was never sent", () => {
    expect(renderToStaticMarkup(<ApprovalFeedback approval={null} />)).toBe("");
  });

  it("separates sent-but-unopened from opened-and-silent", () => {
    const unopened = renderToStaticMarkup(
      <ApprovalFeedback
        approval={{ token: "t", status: "PENDING", respondedAt: null, firstViewedAt: null }}
      />,
    );
    expect(unopened).toContain("not opened yet");

    const opened = renderToStaticMarkup(
      <ApprovalFeedback
        approval={{
          token: "t",
          status: "PENDING",
          respondedAt: null,
          firstViewedAt: "2026-08-01T09:00:00.000Z",
        }}
      />,
    );
    expect(opened).toContain("no answer yet");
    expect(opened).not.toContain("not opened yet");
  });

  it("quotes the reason a customer gave for declining, and names them", () => {
    const html = renderToStaticMarkup(
      <ApprovalFeedback
        approval={{
          token: "t",
          status: "DECLINED",
          respondedAt: "2026-08-02T09:00:00.000Z",
          responderName: "Chipo Marange",
          responseNote: "Too high against the other bid.",
        }}
      />,
    );
    expect(html).toContain("Chipo Marange");
    expect(html).toContain("declined");
    expect(html).toContain("Too high against the other bid.");
    // Red is reserved for the answer that needs acting on.
    expect(html).toContain("--status-error-text");
  });

  it("draws an acceptance in the confirming colour, not the alarming one", () => {
    const html = renderToStaticMarkup(
      <ApprovalFeedback
        approval={{
          token: "t",
          status: "APPROVED",
          respondedAt: "2026-08-02T09:00:00.000Z",
          responderName: "Chipo Marange",
          responseNote: null,
        }}
      />,
    );
    expect(html).toContain("accepted");
    expect(html).toContain("--status-success-text");
    expect(html).not.toContain("--status-error-text");
  });
});
