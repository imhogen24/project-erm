// D1.11's fixed questions and choices, from the sheet
// (docs/dev_docs/WORKBOOK_01, D1.11).

export const riskLevels = ["H", "M", "L"]

export const conclusionQuestions = [
  'Are there any "High Probability / High Impact" risks that cannot be mitigated?',
  "Does the mitigation of these risks push the project over the client's budget?",
  "Is IMHOGEN willing to accept the residual risk of this project?",
  "Should the project proceed exactly as originally requested?",
]

export const conclusionAnswers = [
  "Yes",
  "Yes, Conditional",
  "No",
  "Partial / Undetermined",
]

// The workflow reads these: No-Go closes the project, and the others open
// D1.12 (server/workflow/wb01.ts).
export const goNoGoDecisions = ["Go", "Conditional Go", "No-Go"]
