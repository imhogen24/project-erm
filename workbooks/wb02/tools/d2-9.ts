import { NEGOTIATION_INVITE } from "@/lib/negotiation-invite"
import { DEADLOCK, meetingOutcomes } from "@/lib/negotiation-notes"
import { defineTool } from "@/server/tools/define-tool"

const execution = "1.0 Meeting execution metadata"

const tracker = "2.0 Live redline & negotiation tracker"

const parkingLot = "3.0 Parking lot (Unresolved contract items)"

const routing = "4.0 Negotiation outcome & routing"

// The negotiation meeting notes, on both tiers, opened when D2.8 locks. The
// CA records each clause the client challenged, what they asked for,
// IMHOGEN's limit and what was agreed, with anything left open in the
// parking lot. IMHOGEN's limit is its own: the client never gets that
// column. The CA signs and submits, which locks D2.9; nobody approves it.
// Terms Agreed opens D2.10, Client Withdrawn closes the project, and Deadlock
// reopens D2.8 for another meeting and tells the HE and PM.
export const d29 = defineTool({
  id: "D2.9",
  name: "Negotiation Meeting Notes",
  workbook: "wb02",
  tier: "both",
  locksOnSubmit: true,
  sendsBackTo: {
    field: "meetingOutcome",
    is: DEADLOCK,
    tools: [NEGOTIATION_INVITE],
    notifies: ["HE", "PM"],
  },
  fields: [
    {
      key: "requestId",
      label: "Project Request ID",
      type: "text",
      systemFilled: true,
      section: execution,
    },
    {
      key: "actualDate",
      label: "Actual Date",
      type: "date",
      required: true,
      section: execution,
    },
    {
      key: "startEndTime",
      label: "Start / End Time",
      type: "text",
      placeholder: "00:00 to 00:00",
      section: execution,
    },
    {
      key: "leadNegotiator",
      label: "Lead IMHOGEN Negotiator",
      type: "text",
      section: execution,
    },
    {
      key: "clientNegotiator",
      label: "Primary Client Negotiator",
      type: "text",
      section: execution,
    },
    {
      key: "redlines",
      label: tracker,
      type: "table",
      required: true,
      startsWithRow: true,
      columns: [
        { key: "sn", label: "SN", type: "text", numbered: "2" },
        {
          key: "clause",
          label: "Contract Clause in Question",
          type: "text",
          required: true,
          placeholders: ["e.g. Sec 3.1 - Total Value"],
        },
        {
          key: "requestedChange",
          label: "Client's Requested Change",
          type: "longText",
          required: true,
          placeholders: ["e.g. Wants 10% discount on final price"],
        },
        {
          key: "baselineLimit",
          label: "IMHOGEN's Baseline Limit (From D2.6)",
          type: "longText",
          required: true,
          internalOnly: true,
          placeholders: ["e.g. Min viable is GHS 160"],
        },
        {
          key: "resolution",
          label: "Final Agreed Resolution / Concession",
          type: "longText",
          required: true,
          placeholders: ["e.g. Agreed to 5% discount"],
        },
      ],
    },
    {
      key: "parkingLot",
      label: parkingLot,
      type: "table",
      startsWithRow: true,
      columns: [
        {
          key: "item",
          label: "Item Description",
          type: "longText",
          placeholders: [
            "e.g. Client's legal team needs to review our IP buyout clause wording",
          ],
        },
        {
          key: "owner",
          label: "Who is responsible for resolving?",
          type: "text",
          placeholders: ["e.g. Client Legal Team"],
        },
        { key: "deadline", label: "Deadline for Resolution", type: "date" },
      ],
    },
    {
      key: "meetingOutcome",
      label: "Meeting Outcome",
      type: "select",
      options: meetingOutcomes,
      required: true,
      section: routing,
    },
    {
      key: "nextSteps",
      label: "Summary of Next Steps",
      type: "longText",
      placeholder:
        "e.g. Contract Admin to apply the 5% discount and IP buyout clause to the finalized contract.",
      section: routing,
    },
    {
      key: "leadSignature",
      label: "Lead Negotiator Signature",
      type: "signature",
      signedBy: ["CA"],
      section: routing,
    },
    {
      key: "signedDate",
      label: "Date",
      type: "date",
      systemFilled: true,
      systemNote: "Filled in when the Lead Negotiator signs",
      section: routing,
    },
  ],
})
