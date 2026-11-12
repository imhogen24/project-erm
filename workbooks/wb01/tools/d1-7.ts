import { defineTool } from "@/server/tools/define-tool"

const metadata = "1.0 Meeting execution metadata"

const discussion = "2.0 Live discussion capture"

const parking = "3.0 Parking lot"

const closeOut = "4.0 Meeting close-out"

// The notes the OM takes in the discovery meeting. The discussion rows start
// from D1.6's agenda and the attendees from who D1.6 invited, so the OM ticks
// who came and types what was said (lib/meeting-notes). The OM submits; the PM
// approves, which locks it, or sends it back. The client reads it only once
// locked. Tier 1 only. The sheet is the source: docs/dev_docs/WORKBOOK_01, D1.7.
export const d17 = defineTool({
  id: "D1.7",
  name: "Raw Meeting Notes",
  workbook: "wb01",
  tier: 1,
  clientReadsOnceLocked: true,
  fields: [
    {
      key: "actualDate",
      label: "Actual Date",
      type: "date",
      required: true,
      section: metadata,
    },
    {
      key: "actualStartTime",
      label: "Actual Start Time",
      type: "time",
      required: true,
      section: metadata,
    },
    {
      key: "actualEndTime",
      label: "Actual End Time",
      type: "time",
      required: true,
      section: metadata,
    },
    {
      key: "recordingLink",
      label: "Recording Link (if applicable)",
      type: "text",
      section: metadata,
    },
    {
      key: "imhogenPresent",
      label: "Attendees Present (IMHOGEN)",
      type: "table",
      required: true,
      section: metadata,
      startsWithRow: true,
      columns: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "present", label: "Present", type: "boolean" },
      ],
    },
    {
      key: "clientPresent",
      label: "Attendees Present (Client)",
      type: "table",
      required: true,
      section: metadata,
      startsWithRow: true,
      columns: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "present", label: "Present", type: "boolean" },
      ],
    },
    {
      key: "discussion",
      label: "Live discussion capture (aligns with D1.6 agenda)",
      type: "table",
      required: true,
      section: discussion,
      startsWithRow: true,
      columns: [
        {
          key: "minutes",
          label: "Time Allotted (mins)",
          type: "number",
        },
        { key: "topic", label: "Agenda Topic", type: "text", required: true },
        // Every row needs its notes: a topic that was not discussed is removed.
        {
          key: "rawNotes",
          label: "Raw Notes / Direct Client Statements",
          type: "longText",
          required: true,
        },
        {
          key: "remarks",
          label: "IMHOGEN Clarifications / Immediate Remarks",
          type: "longText",
        },
      ],
    },
    {
      key: "parkingLot",
      label: "Parking lot (unresolved questions or out-of-scope requests)",
      type: "table",
      section: parking,
      columns: [
        {
          key: "item",
          label: "Item Description",
          type: "longText",
          required: true,
        },
        {
          key: "action",
          label: "Action Required / Who to resolve?",
          type: "text",
        },
      ],
    },
    {
      key: "primaryOutcome",
      label: "Primary Outcome",
      type: "longText",
      required: true,
      section: closeOut,
    },
    {
      key: "clientNextStep",
      label: "Client Next Step",
      type: "longText",
      required: true,
      section: closeOut,
    },
    {
      key: "imhogenNextStep",
      label: "IMHOGEN Next Step",
      type: "longText",
      required: true,
      section: closeOut,
    },
  ],
})
