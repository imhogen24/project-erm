// IMHOGEN's own details, one setting for the whole app, as the invoices
// show them (D3.4, and later D3.5 and D3.6).

export type BankDetails = {
  bankName: string
  accountName: string
  accountNumber: string
  branch: string
}

// PLACEHOLDER: Finance has not given the real account yet. Every value but
// the account name is marked as a placeholder, so nobody mistakes it for the
// account to pay into. Replace these once Finance confirms the account.
export const companyBank: BankDetails = {
  bankName: "[Placeholder] Bank to be confirmed by Finance",
  accountName: "IMHOGEN LTD",
  accountNumber: "[Placeholder] 0000000000000",
  branch: "[Placeholder] Branch to be confirmed by Finance",
}
