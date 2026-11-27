import { briefingTopics, YES, yesNo } from "@/lib/kickoff-deck"
import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Deck Metadata"

const routing = "3.0 Routing"

// The internal kick-off deck, the fifth tool of Workbook 4, on Tier 1 only,
// opened once D4.4 locks. 1.0 is the system's but for the deck, which the
// PM uploads as a PDF. 2.0 starts on the sheet's five mandatory topics, each
// with View opening the record it comes from, which can't be changed or
// removed; the PM may add rows after them. The PM answers every row Yes,
// answers 3.0 Yes, signs and submits, which locks it: there is no approver.
export const d45 = defineTool({
  id: "D4.5",
  name: "Internal Kick-off Deck",
  workbook: "wb04",
  tier: 1,
  writers: ["PM"],
  locksOnSubmit: true,
  submitNeeds: [
    {
      field: "pmSignature",
      message: "Sign as the Project Manager before submitting",
    },
  ],
  submitWhen: [
    {
      field: "slideChecklist",
      column: "included",
      is: YES,
      message: "Answer Yes for every topic once it is in the deck",
    },
    {
      field: "deckReady",
      is: YES,
      message:
        "Answer Yes once the deck is complete and ready for the Internal Kick-off Meeting",
    },
  ],
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
    },
    {
      key: "preparedBy",
      label: "Prepared By (Project Manager)",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "projectClientName",
      label: "Project / Client Name",
      type: "text",
      systemFilled: true,
      section: metadata,
    },
    {
      key: "deck",
      label: "Link to Presentation Deck",
      type: "fileLink",
      pdfOnly: true,
      required: true,
      section: metadata,
    },
    {
      key: "slideChecklist",
      label: "2.0 Mandatory Slide Inclusion Checklist",
      type: "table",
      required: true,
      fixedRows: briefingTopics.map(({ topic, source }) => ({ topic, source })),
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "topic",
          label: "Required Briefing Topic",
          type: "text",
          required: true,
        },
        {
          key: "source",
          label: "Source Document Reference",
          type: "pdfPreview",
        },
        {
          key: "included",
          label: "Included in Deck? (Yes/No)",
          type: "select",
          options: yesNo,
          required: true,
        },
        { key: "notes", label: "PM Notes", type: "longText" },
      ],
    },
    {
      key: "deckReady",
      label:
        "Is the deck complete and ready for the Internal Kick-off Meeting?",
      type: "select",
      options: yesNo,
      required: true,
      section: routing,
    },
    {
      key: "pmSignature",
      label: "Project Manager Signature",
      type: "signature",
      signedBy: ["PM"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Project Manager signs",
      section: routing,
    },
  ],
})
