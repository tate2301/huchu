# ZIMRA Fiscalisation & FDMS Integration Notes

## Scope
This document summarises ZIMRA fiscalisation requirements that inform the accounting module. It is guidance only; always confirm with ZIMRA and approved suppliers for compliance changes.

## Who must fiscalise
- ZIMRA states that all VAT-registered operators must fiscalise and comply with the Fiscalisation Data Management System (FDMS) requirements.
- Fiscalisation is also required for other taxpayers under the Income Tax Act; VAT registration status does not exempt a taxpayer from fiscalisation obligations.

## Fiscal device options
ZIMRA recognises both hardware and virtual fiscal devices. Taxpayers may choose the device type that fits their business and technical capacity. Virtual fiscalisation requires API integration with FDMS.

## Fiscal Tax Invoice required fields
ZIMRA lists required elements for a fiscal tax invoice, including:
- The words "Fiscal Tax Invoice" prominently shown
- Supplier name, address, VAT and Business Partner registration number
- Recipient name and address, and VAT/Business Partner numbers when the recipient is a registered operator
- Serialised invoice number and issue date
- Description of goods/services and quantity/volume
- Currency used
- Value of supply, tax charged, and total consideration (or tax fraction statement)

## Validation and QR codes
ZIMRA guidance indicates that fiscal tax invoices should include verifiable QR/validation codes for checking on the FDMS portal. The FDMS portal shows invoices as VALID or NOT VALID after verification.

## Platform implementation mapping
- Supplier details are stored in `AccountingSettings` (legal name, trading name, VAT number, tax number, address, phone, email).
- Customer details are stored on `Customer` and included in fiscal payloads when issuing receipts.
- `FiscalisationProviderConfig` stores FDMS connection credentials, device ID, and additional metadata.
- `FiscalReceipt` stores status, fiscal number, QR data, signatures, and raw provider responses.
- `issueFiscalReceipt` validates mandatory fields before queueing a receipt.

## Operational flow in the platform
1. Issue sales invoice (manual or auto) in the accounting module.
2. If ZIMRA fiscalisation add-on is enabled, the system validates required fields and issues a fiscal receipt.
3. Receipts are tracked in `/accounting/fiscalisation` for status and audit.

## References
- ZIMRA Fiscal Tax Invoice requirements: https://www.zimra.co.zw/news/2240-fiscal-tax-invoice
- ZIMRA Fiscalisation explained: https://www.zimra.co.zw/domestic-taxes/corporate/fiscalisation-explained
- ZIMRA FDMS invoice validation: https://www.zimra.co.zw/frequently-asked-questions/2322-how-to-validate-and-review-of-details-on-fiscal-tax-invoices-debit-or-credit-note-on-fdms
- FDMS validation portal: https://fdms.zimra.co.zw/
