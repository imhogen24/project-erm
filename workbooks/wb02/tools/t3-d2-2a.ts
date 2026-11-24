import {
  dateKey,
  ipOptions,
  liabilityWaiver,
  nameKey,
  signOff,
  signatureKey,
} from "@/lib/t3-contract"
import { defineTool, type ToolInput } from "@/server/tools/define-tool"

// The sheet gives the waiver and the sign-off the same title.
const boilerplate = "D2.1 Standard contract template (Boilerplate clauses)"

// Each sign-off row's name and date are the system's: the role's holder, and
// the day they sign (server/contract/t3-contract).
const signOffValues: ToolInput["fields"] = signOff.flatMap((row) => [
  {
    key: nameKey(row),
    label: row.role,
    type: "text",
    systemFilled: true,
    section: boilerplate,
  },
  {
    key: dateKey(row),
    label: `Date (${row.role})`,
    type: "date",
    systemFilled: true,
    systemNote: `Filled in when the ${row.signer} signs`,
    section: boilerplate,
  },
])

const signatures: ToolInput["fields"] = signOff.map((row) => ({
  key: signatureKey(row),
  label: `${row.role} Signature`,
  type: "signature",
  signedBy: [row.signer],
  section: boilerplate,
}))

// The Tier 3 contract mapping, in place of D2.2, opened once D2.1 locks. The
// OM picks who owns the CAD files, with the fee if the client buys them, and
// submits. Then the FO signs, the PM signs, which approves it, and the client
// signs, which locks it and opens D2.3. The sheet is the source:
// docs/dev_docs/WORKBOOK_02, T3.D2.2a.
export const t3d22a = defineTool({
  id: "T3.D2.2a",
  name: "T3 Drafting Contract Mapping",
  workbook: "wb02",
  tier: 3,
  replaces: "D2.2",
  signInTurn: {
    order: ["foSignature", "pmSignature", "clientSignature"],
    approves: "pmSignature",
  },
  fields: [
    {
      key: "ipElection",
      label: "1.0 Intellectual property (IP) election",
      type: "table",
      required: true,
      fixedRows: ipOptions,
      pickOne: { column: "picked", needs: ["fee"] },
      columns: [
        { key: "picked", label: "Check One", type: "boolean" },
        { key: "option", label: "Option", type: "text", required: true },
        {
          key: "definition",
          label: "Legal Definition",
          type: "text",
          required: true,
        },
        { key: "fee", label: "Fee (GHS)", type: "currency" },
      ],
    },
    {
      key: "liabilityWaiver",
      label: boilerplate,
      type: "staticList",
      items: liabilityWaiver,
    },
    ...signOffValues,
    ...signatures,
  ],
})
