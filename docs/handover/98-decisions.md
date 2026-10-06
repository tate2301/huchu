# 98 Decisions

These settle the "Decide" items in `99-coverage.md` and the open questions the specs raised. They take precedence
over any spec that says otherwise.

Every other resolution in `99-coverage.md` §3 stands as written, and the unit it names applies it.

Two rules hold throughout: the canvas chooses the direction, and there is no backward compatibility.

## The six items to settle

**C-04 One WhatsApp webhook.** There is one public route, `POST/GET /api/webhooks/whatsapp`, owned by SET-07.
- It uses these environment names: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_VERIFY_TOKEN` and `META_WHATSAPP_APP_SECRET`.
- It verifies the signature, then sends each event to the handler registered for it:
  - reply matching on orders (BUY-02);
  - STOP and opt-out (CUS-06);
  - the owner's yes to support access (ADM-10, optional).
- With no token configured, messages stay queued and the screens say so; nothing fails.

**C-14 One settings contract.** Every settings page loads and saves through `GET/PATCH /api/v2/retail/settings/[page]`. Each save writes one `RETAIL_SETTINGS.CHANGED` event.

Real actions keep their own endpoints:
- test print;
- fiscal connect and close day;
- Post now;
- pairing;
- plan change;
- the ZiG rate.

**C-31 One manager-PIN module.**
- SET-06 builds `lib/retail/manager-pin.ts` with `verifyManagerPin`. A request carries `approver { userId, pin }`.
- A missing or wrong approval answers 409 `{ needsApprover: true, reason }`.
- It works at the till and in the back office.
- Lockout follows ADM-03: after five wrong tries the PIN is locked until a new PIN is issued, answering 423.
- STK-04, FLR-02, FLR-09 and CUS-10 use this module. ADM-06 adds the audit call.

**C-33 Paying from a till: keep the earlier decision.** The owner already decided this. A requisition payout is recorded as paid from a money account and never moves a till drawer, so there is no `RetailCashMovement`.
- BUY-05's model stands.
- FLR-03 does not add `requisitionId` to cash movements, and it does not add a "Pay a supplier" reason.
- The "Pay a supplier" card on `CashMove` is not built. Cash in or out offers the other reasons only.
- BUY-08's "Cash now" pays from the chosen money account, for example "Front till float". That is a money account in the books, not the drawer.

**C-35 Reports follow the Roles board.** Reports are offered to the roles the Roles board gives them to: owner, manager and bookkeeper. Cashiers and stock clerks have no Reports destination.
- A template shared with "Everyone" reaches everyone who can open Reports.
- The sheet's hint says: "Everyone who opens reports".
- The rows any reader sees are still limited by their own role.

**C-40 Test accounts.** There is one account per role, and every acceptance line uses these. The password is `RetailDemo123!`.

| Role | Account | Name |
|---|---|---|
| Owner | `owner@bottlestore.test` | (as seeded) |
| Manager | `tafara.manager@bottlestore.test` | Tafara Nyathi |
| Cashier | `chipo.till@bottlestore.test` | Chipo Dube |
| Cashier, Borrowdale | `farai.till@bottlestore.test` | Farai Moyo |
| Stock clerk | `tendai.stock@bottlestore.test` | Tendai Sibanda |
| Bookkeeper (`FINANCE_OFFICER`) | `bookkeeper@bottlestore.test` | Ruvimbo Chari |
| Corelith superuser | the platform superadmin the seeds already create | — |

Rudo Moyo stays a stock clerk in the data (she counts on the phone), but she is not a login used for acceptance.

For C-42, Farai keeps Borrowdale and also gets Harare Main Branch, so the stale Back till shift stays his.

## Foundations open questions (00-foundations.md)

1. **Notifications** leave the header in every product. They move into the logo tile's account menu, which shows an unread dot.
2. **Pinned rail marks and the area-map panel view** are removed in every product.
3. **Tenant branding colour** no longer tints the interface. The product theme does. The tenant logo still shows.
4. **IBM Plex Mono** replaces Atkinson Hyperlegible Mono in every product.
5. **Routes** are module-prefixed as in 00-foundations §5.3.4, with Reports at `/retail/reports` (C-16) and import at `/retail/products/import` (C-17).
6. **Shifts** defaults to "Opened: Last 30 days".
7. **FINANCE_OFFICER** gets its grants from ADM-01's matrix, transcribed from the Roles board.
8. **Items with no board** ("Defined here") are built as the spec defines them. No new boards are drawn first.
9. **Corelith Workspace (G1) against the canvas**: follow the canvas.
   - Rows use `--selected`.
   - The sheet is 520 or 760 px wide.
   - Totals sit on `--ground`.
   - Only the selected state comes from G1: solid ink with white text.
   - "Selected state" means the chosen item only: a selected row, the chosen cell of a segmented control, the current nav item. Everything around it follows the canvas:
     - A segmented control is the board's row of equal white cells with borders and dividers, not a filled track. Only the chosen cell is solid ink with white text.
     - A switch that is on uses the board's green. A switch is a setting, not a selection.
     - A card's border stays light whether its switch is on or off.
     - These live in the shared `.cx-seg--field` and `.cx-switch-row` classes in `app/themes/workspace.css`, so every settings page follows them together.
10. **Chart ranges** appear only where the record kind has a range.
11. **Company › Money**: SET-01 makes it editable. Changing the base currency is refused while sales exist, and the field explains why.

## Area open questions

Each area spec lists its own open questions. A build unit takes the answer its spec recommends. If the spec has no recommendation, the unit takes what the board draws.

The unit records each choice in its report. If a board draws something with no data behind it (an integration that does not exist, a figure nobody keeps), the unit builds the honest version: it hides the option or rewords the hint. It never fakes a value.

Recorded unit choices:

- **SET-09 account fields list only the types they take.** Sales lists income accounts, Stock asset accounts, a tender asset accounts
  (vouchers: asset or liability), and so on (`ROLE_TYPES`, `TENDER_TYPES`, `VOUCHER_TYPES` in `lib/retail/posting-words.ts`). The save refuses
  any other type by field, so the list never offers what the save would refuse. A quick-added account appears in every field of its type,
  not in every field.
- **SET-09 posts one run per company at a time.** "Post now" pressed while a run is going joins it; what could not post is tried again by
  the next run, and "Ready to post" shows a fourth warn line while anything is waiting to be tried again (10-setup §4.9).

## Owner direction, 5 October: sidebar, Management and Setup

These override 00-foundations §5.3 and every spec that disagrees.

1. **The sidebar's structure is not ours to change.**
   - The panel keeps its two levels: the workspace's module list, and a module's own items.
   - The chevron before a module's title goes **back to the module list inside the panel**. It does not collapse the panel.
   - Collapsing is a separate control in the panel header, as on `Main.dc.html`, plus Cmd/Ctrl+B.
   - The canvas look (rail, panel, item sizes, badges, theme) stays.
2. **The gear (Settings) opens the existing Management UI** at `/management/master-data`. That is the `ManagementShell` with its settings rail, already built.
   - There is no retail "Management" module.
   - Things Management already has are not rebuilt in retail: company legal details, branding, users and the user directory, master-data sites, billing and plan, activity.
   - Retail pages link to the Management page or extend it.
3. **Retail-specific settings live in the retail sidebar under a "Setup" module.** It takes the pages the canvas draws under Management that are about the shop:
   - Shop: business type, liquor features, money rules
   - Tills and devices
   - Payments
   - Till rules
   - Receipts
   - Fiscal device
   - Posting to the books
   - Approvals
   - Loyalty
   - Staff and PINs: retail roles, till PINs, site access
   - Bin

   Routes stay under `/retail/manage/*`. Every board that drew "Management" for these pages now reads "Setup" in the panel title and the back link.
4. **Units affected:** FND-08 and SET-01 build the Shop page, not "Company". The other SET and ADM units place their pages under Setup.
5. **The sidebar keeps every function it had, always.** The owner said: "we need to retain the functionality of the sidebar always." No unit may remove or move a sidebar function. That covers:
   - search;
   - pins;
   - the area-map and flat views;
   - the workspace switcher;
   - Help and Management;
   - the account menu;
   - collapse;
   - notifications.

   A unit may restyle a sidebar function to the canvas. It may only add to the sidebar.
6. **Two owner calls on the shell:**
   - **The logo-tile account popover stays as it is.** The owner likes it. It holds identity, Search, Notifications, This device, Profile, Appearance, Guided tips, Help, the workspace switch and Sign out.
   - **The top app bar comes back** with everything it had: sidebar trigger, page title, search ⌘K, device status, notifications bell and the primary action. The page header's back link, title and subtitle sit inside that bar.
7. **"What it says" becomes the headline summary.**
   - **Where:** every page that has a "What it says" panel or aside: the Insights pages, the dashboards, and any record or list that draws one.
   - **What replaces it:** the owner's reference (a Boarders page) puts the summary at the top of the content, under the tabs and filters and above the table or charts. It is two sentences in a large type:
     - the first states the fact in ink, for example "86 boarders in six dorms.";
     - the second says what to notice in muted ink, for example "7 are not in the house tonight.".
   - **The words come from the page's real data**, computed on the server. For example: "US$18,940 taken this month across two shops." / "Sales are 12% down on last month, mostly at Borrowdale."
   - **When there is too little data to say anything**, the headline still reads as a sentence about the data, never as a separate box, for example:
     - "No sales yet this week."
     - "Too few sales in these dates to compare. Widen the period."

     "Not enough trade in this period to say" is no longer drawn as a panel.
   - **Removed:** the separate "What it says" panel or aside.
8. **Two follow-ups to the Management direction:**
   - **Sites (shops, the places inside them, the default site) is a retail Setup page.** SET-02 builds it at `/retail/manage/sites` on the same `Site` model that Management uses. Management's operations sites page is a mining master-data screen, and shops are not managed there.
   - **Plan and billing stays in Management.** SET-10 is not built. The paired-till limit (`maxTills`, C-07) still lands with SET-03.
