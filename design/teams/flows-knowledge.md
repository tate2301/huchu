# W5. Setting up from a document: Vane learns the business

The first step after signing up for Pabasa takes the company profile a business already has. Vane
reads it and fills in setup. People keep each thing before it is used. The same step in Tender turns
a price list into products.

Clock: Tuesday 1 September 2026, Harare (Kuda Interiors); Wednesday 14 October 2026 (Mufaro
Hardware). Everything here is made up for the mock.

## Start

Kudakwashe Sibanda, owner of Kuda Interiors, has just signed up for Pabasa at the workshop office
on his laptop, at 08:14. He has the company profile PDF on his desktop: 12 pages, 4.8 MB. The
workspace has one member, him, and 5 sample clients. Vane knows nothing about the business yet.

## Steps

1. **Start from a document** (`O1-start`). This is Pabasa's first setup step, *Your business*, in
   a focused frame with no sidebar. He drags the PDF over the drop zone and it lights up. Other
   ways in: Choose a document (Ctrl O), give Vane the website address, or Fill it in yourself (F).
   *Transition:* CrmKnowledgeDoc created (kind DOCUMENT, 12 pages, uploadedBy Kudakwashe), and a
   Vane read job queued.
2. **Vane reads** (`O2-reading`). Pages tick off one by one ("Reading page 9 of 12, about 30
   seconds left"). What Vane finds lands under What you sell, About Kuda Interiors and Vane will
   ask you, with the page each item came from. The page being read shows on the right with its
   lines lighting up. Steps 3, 4 and 5 show "Vane is filling this in". He can carry on to his
   clients (Ctrl Enter); reading goes on without him.
   *Transition:* CrmKnowledgeEntry rows (FACT, FAQ) and CrmKnowledgePrice rows created, each with
   madeByVane = true, kept = false, docId and the quoted source line; vaneReadAt is set at the end.
3. **Keep what's right** (`O3-review`). "Vane read 12 pages and found 36 things." The tabs are
   Needs an answer 1, About the company 7, What you sell 13, How you work 9 and FAQs 7. One
   question comes first: page 4 says kitchens from US$170.00 a linear metre, but the price guide
   on page 9 says US$185.00. He answers US$185.00 (1). Each row offers Keep (K), Change (C) or Not
   this (X). He says Not this to the office desk, which they no longer make. The selected row shows
   on page 9 in the panel. Then he presses Keep the other 21 (Ctrl Enter).
   *Transition:* kept = true on 35 items; the office desk price is not used. Setup steps How a job
   moves, Quotes that look like you and Your business are written from kept facts.
4. **For you** (`O4-for-you`). The checklist reads 3 of 6, filled in from the profile:
   - **Your business:** carpentry and interiors in Harare, Chitungwiza, Ruwa and Norton, with the
     logo from page 1.
   - **How a job moves:** seven stages from page 10.
   - **Quotes that look like you:** the workshop address, CBZ and EcoCash, a 60% deposit, valid
     30 days, and a 2-year warranty.
   - **Your team:** page 3 named Rudo, Tinashe and Farai, so the step offers Invite 3 people.

   He tests Vane with "What do we charge for a reception counter in oak?" The answer: "US$520.00
   a linear metre in oak veneer…", citing the price guide, page 9, kept by him at 08:21. He can
   keep the answer as an FAQ.
5. **A printed list, on the phone** (`O5-photo-phone`, 08:40). The extras list is pinned on the
   workshop wall and isn't in the profile. He photographs both pages. The edges are found and the
   shutter is ready; Done hands them to Vane. Vane finds 9 prices: 5 on page 1 and 4 on page 2.
6. **Knowledge afterwards** (`O6-knowledge`, 08:52). Prices has 21: 12 from the profile and 9 from
   the photos. The 4 from page 2 wait for him. A price opens in the standard right panel, showing
   the figure, the lines of page 9 it came from, who found and kept it, and where it has been
   used. Taking the document out leaves the price.

**Tender variant** (`O7-tender-price-list`). Nyasha Mlambo sets up Mufaro Hardware and drops
*Mufaro price list Oct 2026.xlsx* on What you sell: 3 sheets and 226 rows. Vane matches the columns:
- Code → Code
- Description → Name
- Unit → Sold by
- Price USD → Price

Bold headings become 11 categories, and ZiG prices follow the morning rate. That gives **214
products ready to import, 12 rows skipped**:
- **No price (5):** Add the 5 prices.
- **Same code as another row (3):** Choose which is which.
- **Says call for price (2):** Price them at the till.
- **Totals, not products (2):** nothing to fix.

Import 214 products (Ctrl Enter) also takes the 6 sample products out. This is A3's "214 products
imported from a spreadsheet · 12 rows skipped".

## End

Kuda Interiors has 1 document, 16 facts, 7 FAQs and 12 kept prices from the profile, plus 9 prices
from the photos (4 still waiting). Three setup steps are done without being typed. Vane quotes only
from kept prices and answers from kept entries, always naming the page.

What each other role sees:
- **Rudo, Tinashe and Farai (once invited)** land on For you, never on setup. Knowledge is there
  for them to read.
- **Field workers** see prices in quotes that Rudo or Kudakwashe send. They can't change
  Knowledge.
- **Clients** see nothing until a quote goes out.

## Failures (`O-F-failures`)

Each has one way out.

| When | What happened | What still works | Way out |
|---|---|---|---|
| Reading | Pages 7 and 8 are scans too blurred to read | The other 10 pages are ready to check | Photograph them on your phone |
| Choosing | The PDF has a password | Nothing is read yet | Open and read it (the password is used once, not kept) |
| Choosing | The portfolio is 86 MB; the limit is 25 MB | — | Choose a smaller copy |
| Reading | Page 1 names Kuda Designs (Private) Limited, Bulawayo | Vane stops at page 1 | It's ours, keep reading |
| Choosing | The same profile is dropped again | The 35 things already kept | See what you kept |
| Any | Vane can't reach its reader (stopped at page 4 of 12) | The document is saved and setup carries on; Vane picks up at page 5 by itself | Carry on to your clients |
| Any | Over Vane's allowance | Setup carries on; reading waits for 1 November | Choose a plan |

## Actions counted

From signing up to Vane knowing the business takes four actions: drop the document, answer one
question, Keep the other 21, then Carry on. Nothing asks twice. Keeping can be undone on each row,
and taking the document out leaves what was kept.
