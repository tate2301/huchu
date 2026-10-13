// saas-design reference behaviour for a worked-in table. No dependencies.
// Markup: .table-shell > .table-scroll > table.table, then .table-foot with .foot-sel and .foot-main.
// What it does: selection (click, shift-click for a range, the header box for the page), a footer row
// that rises with the count and the sum of the selection, "Back to top" once scrolled, a shadow on
// the footer while rows are hidden beneath it, and J / K / X / Escape on the keyboard.
for (const shell of document.querySelectorAll(".table-shell")) {
  const scroll = shell.querySelector(".table-scroll"), foot = shell.querySelector(".table-foot");
  const rows = [...shell.querySelectorAll("tbody tr")], boxes = rows.map((r) => r.querySelector('input[type="checkbox"]'));
  const all = shell.querySelector('thead input[type="checkbox"]');
  const count = shell.querySelector("[data-count]"), sum = shell.querySelector("[data-sum]");
  const money = (v) => "$" + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let last = null;
  const sync = () => {
    const on = rows.filter((r, i) => boxes[i].checked);
    rows.forEach((r, i) => r.setAttribute("aria-selected", boxes[i].checked));
    if (all) { all.checked = on.length === rows.length; all.indeterminate = on.length > 0 && on.length < rows.length; }
    foot.dataset.selected = on.length > 0;
    if (count) count.textContent = on.length;
    if (sum) sum.textContent = money(on.reduce((n, r) => n + parseFloat(r.dataset.value || 0), 0));
  };
  boxes.forEach((b, i) => b.addEventListener("click", (e) => {
    if (e.shiftKey && last != null) { const [a, z] = [Math.min(last, i), Math.max(last, i)]; for (let k = a; k <= z; k++) boxes[k].checked = b.checked; }
    last = i; sync();
  }));
  all?.addEventListener("change", () => { boxes.forEach((b) => (b.checked = all.checked)); sync(); });
  shell.querySelector("[data-clear]")?.addEventListener("click", () => { boxes.forEach((b) => (b.checked = false)); sync(); });
  shell.querySelector("[data-top]")?.addEventListener("click", () => scroll.scrollTo({ top: 0 }));
  const edge = () => { scroll.dataset.scrolled = scroll.scrollTop > 80; scroll.dataset.more = scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1; };
  scroll.addEventListener("scroll", edge, { passive: true }); new ResizeObserver(edge).observe(scroll);
  let at = -1;
  shell.addEventListener("keydown", (e) => {
    if (e.target.matches("input:not([type=checkbox]),textarea,select")) return;
    if (e.key === "j" || e.key === "k") { at = Math.max(0, Math.min(rows.length - 1, at + (e.key === "j" ? 1 : -1))); boxes[at].focus(); rows[at].scrollIntoView({ block: "nearest" }); }
    if (e.key === "x" && at >= 0) { boxes[at].checked = !boxes[at].checked; last = at; sync(); }
    if (e.key === "Escape") { boxes.forEach((b) => (b.checked = false)); sync(); }
  });
  sync(); edge();
}
