import { fileNamePart } from "@/lib/archive"

// The running numbers documents take, each named, such as "invoice". A
// number is formatted from the year it is given in, and the count restarts
// at 1 each year: IMHO-INV26-001, IMHO-INV26-002, then IMHO-INV27-001.
export type Sequence = {
  // What comes before the year, such as "IMHO-INV".
  prefix: string
  // How many digits the count takes, padded with zeros, such as 3 for 001.
  digits: number
}

export const sequences = {
  invoice: { prefix: "IMHO-INV", digits: 3 },
  receipt: { prefix: "IMHO-REC", digits: 3 },
} satisfies Record<string, Sequence>

export type SequenceName = keyof typeof sequences

export function isSequenceName(name: string): name is SequenceName {
  return Object.hasOwn(sequences, name)
}

// The year's two digits a number carries, such as "26" for 2026, in Ghana,
// which keeps UTC.
export function periodOf(when: Date): string {
  return String(when.getUTCFullYear() % 100).padStart(2, "0")
}

// A sequence's number as people read it, such as IMHO-INV26-002.
export function formatNumber(
  sequence: Sequence,
  period: string,
  count: number
): string {
  return `${sequence.prefix}${period}-${String(count).padStart(sequence.digits, "0")}`
}

// The file name of a numbered document sent to a client, such as
// IMHO_INV26_002_AcmeFoods.pdf for invoice IMHO-INV26-002 to Acme Foods.
// The client's name keeps only the letters and digits a file name can hold.
// `unnumbered` stands in for a number not given yet.
export function numberedFileName(
  number: string,
  clientName: string,
  unnumbered: string
): string {
  const part = number.trim().replaceAll(/[^A-Za-z0-9]+/g, "_")

  return `${part || unnumbered}_${fileNamePart(clientName) || "Client"}.pdf`
}
