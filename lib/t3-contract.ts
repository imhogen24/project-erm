// T3.D2.2a, the Tier 3 drafting contract mapping, in place of D2.2: who owns
// the CAD files, and the client's acknowledgement of the data they gave.

export const T3_CONTRACT = "T3.D2.2a"

// 1.0's two options, as the sheet words them. Standard Release costs nothing.
export const ipOptions: Record<string, string>[] = [
  {
    option: "Standard Release",
    definition: "IMHOGEN retains Native CAD; Client gets PDF/STEP",
    fee: "0",
  },
  {
    option: "Full IP Transfer",
    definition: "Client buys Native Source Files (CAD Assets)",
  },
]

export const liabilityWaiver = [
  "The Client acknowledges that IMHOGEN is modeling based on PROVIDED DATA.",
  "IMHOGEN is not responsible for fitment issues arising from inaccuracies in the client's original source model or measurements.",
]

// The sign-off's rows: who signs, the role that does, and the keys of the
// name, signature and date fields of that row.
export const signOff = [
  { role: "Project Manager", signer: "PM", key: "pm" },
  { role: "Finance Officer", signer: "FO", key: "fo" },
  { role: "Client Signatory", signer: "Client", key: "client" },
] as const

export function nameKey(row: (typeof signOff)[number]) {
  return `${row.key}Name`
}

export function signatureKey(row: (typeof signOff)[number]) {
  return `${row.key}Signature`
}

export function dateKey(row: (typeof signOff)[number]) {
  return `${row.key}SignedOn`
}
