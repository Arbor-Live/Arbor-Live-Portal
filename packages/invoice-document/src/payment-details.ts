/**
 * Where clients send money. Shown on the invoice (web + PDF) and on the
 * client portal's payment step, so keep this the single source of truth.
 */
export const ARBOR_PAYMENT_DETAILS = {
  assuEpayUrl: "https://assuepay.stanford.edu/",
  vsoName: "Arbor Live",
  vsoNumber: "5001",
  ijournalPta: "1056598-1-ZBABS",
  ijournalApprover: "O'Neal Patrick",
} as const;
