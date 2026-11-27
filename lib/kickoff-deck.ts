// D4.5, the internal kick-off deck, the fifth tool of Workbook 4, on Tier 1
// only, opened once D4.4 locks: the PM uploads the kick-off slides, confirms
// each mandatory topic is in them, signs and submits, which locks it.

export const KICKOFF_DECK = "D4.5"

export const YES = "Yes"

export const yesNo = [YES, "No"]

// 2.0's fixed topics, in the sheet's order, each with the record it comes
// from: a tool's ID, or "<tool>:<field>" for a file uploaded to it, such as
// D2.12's executed contract.
export const briefingTopics = [
  { topic: "Client Background & Ultimate Vision", source: "D1.8" },
  { topic: "Hard Scope Boundaries (What we are NOT doing)", source: "D1.13" },
  { topic: "Strict Timeline & Handover Dates", source: "D2.12:executedPdf" },
  {
    topic: "Financial/Budget Constraints for Prototyping",
    source: "D1.14",
  },
  { topic: "Known Technical & Operational Risks", source: "D1.11" },
]
