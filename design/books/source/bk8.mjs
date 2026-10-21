
// ================================================================== PHONES: the owner on the move, an approval, a voucher, a fitter's day
const phCss = bkCss + `.m .k-sh{padding:var(--space-16) 0 var(--space-8)}.m .k-nr{padding:0;height:44px}.m .k-find{padding:0}.m .k-find p{font-size:var(--text-16)}.k-pr{display:flex;align-items:center;justify-content:space-between;gap:var(--space-12);min-height:44px;font-size:var(--text-14);color:var(--color-ink-2);box-shadow:inset 0 -1px 0 var(--color-line)}.k-pr .amt{font-weight:500}.k-pr span.muted{font-size:var(--text-12)}`;
PH("bk-p-money.html", "Money, phone", `${back("Money", "Floorcode · today 11:40", `<button class="btn btn-quiet btn-icon" aria-label="Vane">${VN(20)}</button>`)}<div class="m-b">
  ${find1(`${A(IN_MONTH)} in this month.`, `${A(OWED)} owed to you, ${A(OVERDUE)} of it late.`)}
  <section>${sh("Needs you", "5")}${[["Overdue invoices", 3, A(OVERDUE), "warn"], ["Requisitions to approve", 2, A(325)], ["Bill over your limit", 1, A(1200)], ["Failed to post", 1, "", "bad"], ["Bank lines to match", 5, ""]].map(([l, n, a, t]) => nrow(l, n, a, t)).join("")}</section>
  <section>${sh("Bank and cash", A(CASH_TOTAL))}${ACCTS.slice(0, 3).map((a) => `<div class="k-pr"><span>${a[0]}</span>${a[2] === "ZWG" ? AZ(a[3]) : A(a[3])}</div>`).join("")}<div class="k-pr"><span>Cash, 3 floats</span>${A(ACCTS.slice(3).reduce((n, a) => n + a[3], 0))}</div></section>
  <section>${sh("This week", "")}${UPC.slice(0, 4).map(([d, n, v]) => `<div class="k-pr"><span><span class="mono muted">${d}</span> ${n.split(",")[0]}</span>${A(v)}</div>`).join("")}</section>
</div><div class="m-f"><button class="btn btn-primary">${ic("add-fill")}New invoice</button></div>`, phCss);

PH("bk-p-approve.html", "Approve a requisition, phone", `${back("REQ-0043", "Asked by Farai Dube")}<div class="m-b">
  <div class="card"><span class="k-mod">${ic("file-check-fill")}Requisition, from the CRM</span><h2>Floor sander hire, 2 days</h2><span class="big">${A(240)}</span><p>For Msasa Motors, workshop floor. Farai asked at 08:12 today.</p></div>
  <div class="lines">${[["Supplier", "Hire Centre, Msasa"], ["Paid out from", "CBZ current"], ["Your limit", "$500.00, so you can approve"], ["Then paid by", "James, not you"]].map(([a, b]) => `<div class="ln"><span>${a}</span><span style="color:var(--color-ink)">${b}</span></div>`).join("")}</div>
  ${vsay("Farai hired the same sander in August for $220.00. The quote for this job allowed $250.00.", "REQ-0031 and Q-0219")}
</div><div class="m-f"><button class="btn btn-primary">${ic("check-fill")}Approve ${A(240)}</button><button class="btn">${ic("close-fill")}Reject, with a reason</button></div>`, phCss + `.k-mod{display:flex;align-items:center;gap:var(--space-8);font-size:var(--text-12);color:var(--color-muted)}.k-mod .ic{width:14px;height:14px}`);

PH("bk-p-voucher.html", "Petty cash voucher, phone", `${back("New voucher", "Showroom petty cash · holds $163.50")}<div class="m-b">
  <div class="k-slipx">${ic("pic-fill")}<span>Slip photographed</span><span class="mono">Puma, Samora Machel · 11:32</span></div>
  <div class="q"><span class="ql">What for</span><input class="input" value="Courier, samples to Chisipite" aria-label="What for"></div>
  <div class="two-in"><div class="q"><span class="ql">Amount</span><input class="input mono" value="12.00" aria-label="Amount"></div><div class="q"><span class="ql">Expense</span><input class="input" value="Courier" aria-label="Expense"></div></div>
  <div class="banner2 b-info">${ic("information-fill")}<span>Under $20.00 it posts as soon as you save. The float then holds $151.50.</span></div>
</div><div class="m-f"><button class="btn btn-primary">${ic("check-fill")}Save voucher</button></div>`, phCss + `.k-slipx{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-4);height:140px;border-radius:var(--radius-card);background:var(--color-fill);font-size:var(--text-13);color:var(--color-ink-2)}.k-slipx .ic{width:24px;height:24px;color:var(--color-muted)}.k-slipx .mono{font-size:var(--text-12);color:var(--color-muted)}`);

PH("bk-x-crm-cost.html", "Cost tracker, phone", `${back("Today, Mon 5 Oct", "Kuda Maposa · Pomona Offices")}<div class="m-b">
  ${find1(`${A(128.6)} spent, ${A(430)} taken.`, "Send the day in and Books does the rest.")}
  <section>${sh("Spent", A(128.6))}${[["Adhesive, 2 bags", "REQ-0041", 46.8], ["Screed, 3 bags", "REQ-0041", 54.3], ["Fuel, bakkie", "REQ-0041", 20], ["Water for the fitters", "REQ-0041", 7.5]].map(([n, f, v]) => `<div class="k-pr"><span>${n} <span class="muted">from ${f}</span></span>${A(v)}</div>`).join("")}</section>
  <section>${sh("Taken from customers", A(430))}<div class="k-pr"><span>Mrs T. Gumbo, cash <span class="muted">for INV-0141</span></span>${A(430)}</div></section>
  <div class="card"><h2>When you send it in</h2><div class="lines">${[["Requisition", "4 receipts account for REQ-0041; $21.40 to hand back"], ["Cash taken", "A receipt on INV-0141, into your site cash until banked"], ["Your own money", "Nothing today, so no claim"]].map(([a, b]) => `<div class="ln" style="align-items:flex-start;padding:8px 0"><span>${a}</span><span style="color:var(--color-ink);text-align:right;max-width:60%">${b}</span></div>`).join("")}</div></div>
</div><div class="m-f"><button class="btn btn-primary">${ic("send-plane-fill")}Send the day in</button></div>`, phCss);
