# ZIMRA practice in Books

Built as the fixtures show. Rates and dates are settings, never constants in code. Anything marked "to confirm" is in `open.md`.

## Tax codes (`bk-set-tax`)

| Code | Name | Rate | From | Until | Posts to |
|---|---|---|---|---|---|
| V15.5 | VAT, standard | 15.5% | 1 Jan 2026 | | 2200 · 2210 |
| V15 | VAT, standard | 15% | 1 Jan 2023 | 31 Dec 2025 | 2200 · 2210 |
| Z0 | Zero-rated | 0% | | | |
| E | Exempt | | | | |
| WHT30 | Withholding, no ITF263 | 30% | | | 2180 |
| VWH | VAT withheld, a third | 33.33% of VAT | | | 1170 · 2185 |
| IMTT | Transfer tax | 2% USD · 1.5% ZWG | 1 Jan 2026 | | 6930 |

A document keeps the rate in force on its date of supply.

## VAT (`bk-vat`, `bk-tax`)

- VAT 7 return by the 10th, paid by the 15th of the next month.
- September in the fixture: output 2,670.21, input 1,485.61, due 1,184.60 (USD 1,057.27 plus ZWG 3,412.44 at the frozen rates).
- Input VAT is claimed only on bills whose fiscal tax invoice (FTI) is checked valid on FDMS. Unchecked FTIs are a close check.
- The accountant prepares and reviews; the owner, the outside accountant or the manager files (Finalise, Ctrl Enter). A filed return locks its documents against delete.
- VAT withheld by customers who are withholding agents is recorded on the receipt with the certificate number.

## Withholding (`bk-withholding`, `bk-payment-made`)

- Paying a supplier with no ITF263 on file, once payments to them this year pass the threshold, withholds 30% to 2180 Withholding payable. The threshold is a setting (to confirm). The fixture: Halsted Builders, $2,840.00 this year, $312.40 bill, $93.72 withheld.
- A withholding certificate is drafted when the payment is made. The return is due on the 5th, paid by the 10th of the next month.
- If the business becomes a VAT withholding agent (Management, Money and tax), supplier payments withhold a third of their VAT.

## IMTT

2% on USD transfers (1.5% ZWG), posted to 6930 when the bank charges it. The payment screen shows it in "What leaves the bank" before approval.

## Provisional tax (`bk-provisional`)

QPDs at 10%, 25%, 30% and 35% of the year's estimate, on 25 Mar, 25 Jun, 25 Sep and 20 Dec. The fourth date is held as a setting because notices disagree ("Date to confirm"). Reminders go two weeks and two days before each date.

## Payroll taxes

From the pay run: PAYE plus the AIDS levy (3% of PAYE), NSSA (employee 4.5% and employer 4.5%), ZIMDEF (1% of the wage bill), all due by the 10th. Payroll computes them; Books shows them in What's due and drafts the payments.

## Fiscalisation (`bk-fiscal`)

- Invoices, credit notes and receipts are signed through the fiscal device (FDMS). Device setup lives in Management, Fiscal device.
- A document issued while the device is offline is issued and posted, and waits to be signed (INV-0142 in the fixture). Unsigned documents block the close; Retry failed (R).
- Fiscalised documents are corrected only by fiscal credit or debit notes with a reason. Never deleted.
- The fiscal block on each record shows the state (Valid, Pending, Failed), the verification code, the fiscal day and the QR.
