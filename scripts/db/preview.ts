import type { Role } from "@/db/schema"
import { DEV_LOCKED, DEV_UNLOCKED } from "@/server/workflow/dev-unlocked"

import { loginFor, staffWith } from "./seed-data/people"
import {
  ACCEPTED_AS_IS_PROJECT,
  CURRENT_TOOL,
  PAPER_SIGNED_PROJECT,
  NEEDS_TEAM,
  currentToolFor,
  approverOf,
  client,
  testProjectName,
  toolProjectName,
  writerOf,
} from "./seed-data/projects"

const fillIn = toolProjectName("Tier_1", "open")

const approve = toolProjectName("Tier_1", "submitted")

const approved = toolProjectName("Tier_1", "locked")

const tier3Tool = currentToolFor("Tier_3")

const tools =
  tier3Tool === CURRENT_TOOL ? CURRENT_TOOL : `${CURRENT_TOOL} and ${tier3Tool}`

const writer = writerOf(CURRENT_TOOL)

const approver = approverOf(CURRENT_TOOL)

// Each screen built so far, and how to see it. The issue that builds a screen
// adds its line here, then runs `bun run accounts:doc`, so
// docs/TEST_ACCOUNTS/_.md always says who to log in as, where to go, and what
// should be there.
export type Preview = {
  screen: string
  loginAs: Role
  // Someone other than the first person with the role, when the screen is on
  // a project that person is not on.
  email?: string
  path: (projectId: string) => string
  expect: string
}

export const previews: Preview[] = [
  {
    screen: `${tools}, being built, from every role's side`,
    loginAs: writer,
    path: () => "/",
    expect: `Your projects starts with three for ${CURRENT_TOOL} on Tier 1 and three for ${tier3Tool} on Tier 3: 1 Fill in (${writer}) has every tool before it locked and the tool open and empty for the ${writer}, ${loginFor(writer)}. 2 Approve (${approver}) has it submitted and waiting for the ${approver}, ${loginFor(approver)}, with Approve and Send back. 3 Approved has it locked. Everyone is on every one of them, so log in as any role (om@, pm@, le@, he@, qa@ ... @imhogen.test) to see what that role reads, and as the client, ${client.email}, to see what they get. Every password is password.`,
  },
  {
    screen: "D1.16 handoff meeting minutes, as the LE",
    loginAs: "LE",
    path: (id) => `/projects/${id}/tools/D1.16`,
    expect: `On ${fillIn}: 1.0 has Meeting Date and Meeting Time to choose; Reference Request ID, Lead Engineer (Handing Off), Contract Admin (Receiving), Project/Client Name and Project Value (GHS), D1.15's budget total, are the system's. 2.0: Reference Document with View, which opens D1.15 Project Brief & Draft Budget as a PDF in a panel from the right while you stay on D1.16; Scope Summary to write; Payment Terms Agreed starts from D1.15's payment schedules. 3.0: Scope Exclusion, Timeline Risk and Financial Risk locked in place, each with its source (D1.13, D1.11, D1.15) and a directive to write; Add row for more. 4.0: the three checklist tasks with their assignees and a Pending / Done status. Sign Engineering Release and submit. On the Tier 3 projects the value is T3.D1.15a's total and View opens T3.D1.15a T3 Drafting SOW & Quote.`,
  },
  {
    screen: "D1.16 approval, as the PM",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.16`,
    expect: `On ${approve}: the LE's minutes, read only, with Sign on Contracting Acceptance, then Approve and Send back. Approving locks it, which closes Workbook 1. On ${approved} it reads locked. The OM, CA, HE and IT/Admin read it; the client does not see it.`,
  },
  {
    screen: "D2.1 standard contract template, as the CA (RDP-161)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.1`,
    expect: `On ${approved}, where D1.16 is locked, D2.1 is open. 1.0 starts filled in and can be changed: Last Legal Review Date is today, Reviewed By is the project's PM (${staffWith("PM").name}), Governing Jurisdiction Ghana, Default Currency GHS. 2.0: type 40 in Payable upon Execution (%). The table lists the sheet's eight clauses, SN 2.1 to 2.8, each with a padlock: their category and text cannot be changed or removed, only Status (Active / Archived). Clause 2.1 names ${client.organisation}, and 2.3 reads the total sum of GHS 94,400.00 as follows: 40% upon execution, following what you typed. Add row gives a row numbered 2.9 with Status Active and a bin to remove it; fill in its category and text. 3.0: Appendix A (D1.15), B (D1.13), C (D1.11) and D (the stored SLA PDF) each have View, which opens the PDF beside the sheet. Press Submit (there is no approver): it says Submitted and locked, and D2.1 reads Locked with Request a change. The PM, HE and IT/Admin read it without editing; the OM and the client do not see it. ${DEV_LOCKED} (Tier 1) and (Tier 3) have it locked with sample clauses, and Export PDF shows the filled-in clauses.`,
  },
  {
    screen: "D2.2 initial draft contract, as the CA (RDP-164)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.2`,
    expect: `${DEV_LOCKED} (Tier 1) has D2.2 locked with sample values, so it opens for the CA again once the PM sends it back from D2.3 (below), and on ${DEV_UNLOCKED} (Tier 1) it is open empty. As it starts on a project with D2.1 locked and nothing saved: 1.0: Drafted By and Date of Initial Draft say Filled in when D2.2 is submitted; Assigned Project Manager is ${staffWith("PM").name}, Project/Client Name names the project and ${client.organisation}, Overall Project Value is GHS 94,400.00, and Reference Hand-off (D1.16) has View. 2.0 starts filled in and can be changed: Client Legal Entity Name ${client.organisation}, Primary Client Signatory ${client.name}, Total Contract Value GHS 94,400.00, Project Duration 8 weeks. 3.0 Payment Schedule 1 starts as D1.15's 40% at Contract Signing, 60% at Handover, 4.0 Phase 1 as 1 week, and the rows D1.15 has nothing for start empty. 5.0 Phase 1 reads D1.15's key deliverables with a padlock; Phases 2 and 3 read —. Every Source Reference shows the tool (D1.3 or D1.15) with View, which opens its PDF beside the sheet (D1.3 says Not started on the Dev projects, which have no D1.3). Each table has Add row: the new row gets the next SN (2.5, 3.4 ...), a bin, and no source; the sheet's rows have no bin. 6.0 has Scope Exclusion, Timeline Risk and Financial Risk to write a clause for; 7.0's notes show the sheet's hints. Choose No in Ready for PM Review and press Submit: it is refused with Answer Yes once the draft is ready for the PM's review. Answer both Yes, choose Attached or Missing for each appendix, press Sign on Contract Admin Signature and Submit: it says Submitted and locked, Drafted By is you and both dates are today, with Request a change at the foot. The PM, the FO, the HE and the CR read it without editing, and its Views still open; the OM and the client do not see it.`,
  },
  {
    screen: "T3.D2.2a drafting contract mapping, signed in turn (RDP-165)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/T3.D2.2a`,
    expect: `${DEV_LOCKED} (Tier 3) has T3.D2.2a locked, signed by the FO, the PM and the client, so it opens for the OM again once the PM sends it back from D2.3 (below); on ${DEV_UNLOCKED} (Tier 3) it is open empty, and a Tier 1 project shows D2.2 and never T3.D2.2a. 1.0 has two rows with a Check One radio each: Standard Release (IMHOGEN retains Native CAD; Client gets PDF/STEP) with its fee fixed at 0 and a padlock, and Full IP Transfer (Client buys Native Source Files (CAD Assets)) with a Fee (GHS) to type. Picking one lets go of the other, and pressing the picked one again lets go of it; there is no Add row. Below it, D2.1 Standard contract template (Boilerplate clauses) lists the two waiver lines, read only, and a second box of the same title names the signers: Project Manager ${staffWith("PM").name}, Finance Officer ${staffWith("FO").name} and Client Signatory ${client.name}, each Date saying Filled in when that person signs, then the three signature boxes with no Sign for the OM. Press Submit for approval with nothing picked: Pick one option. Pick Full IP Transfer with no fee: Required for the option picked. Type a fee (or pick Standard Release) and submit. Then log in as the FO, ${loginFor("FO")}, and press Sign on Finance Officer Signature; the PM, ${loginFor("PM")}, gets a bell note and signs Project Manager Signature, which approves it (there is no Approve button, only Send back) and reads Approved. The client, ${client.email}, sees T3.D2.2a is waiting for your signature on the project's card on Your projects and in the bell, opens it and signs Client Signatory Signature: it reads Locked, with each name and date filled in. Nobody can sign out of turn, the FO and the client cannot change 1.0, and the LE, AE, CA, HE and CR read it.`,
  },
  {
    screen: "D2.3 PM review draft, as the PM (RDP-166)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D2.3`,
    expect: `${DEV_LOCKED} (Tier 1) and (Tier 3) have D2.3 and D2.4 locked as Approved and D2.5 as Approved for Client Transmission, with sample answers, D2.6 locked and D2.7 locked as Requested Negotiation, D2.8 locked, D2.9 locked as Terms Agreed, D2.10 locked, D2.11 locked as signed in the app, D2.12 and D2.13 locked, so D2.14 is open for the CA. D2.3 opens for the PM again only after D2.5 holds the draft for revision (see D2.5 below) and the CA locks the revised D2.2 (on Tier 3, once the revised T3.D2.2a is signed by the FO, the PM and the client) (below); on ${DEV_UNLOCKED} (Tier 1) it is open empty. As it starts on a project with D2.2 locked and nothing saved: 1.0: Assigned Project Manager is ${staffWith("PM").name}, Date Received for Review is the day D2.2 locked, Project / Client Name names the project and ${client.organisation}, Reference Draft shows D2.2 Initial Draft Contract with View, which opens its PDF beside the sheet, and Date Review Completed says Filled in when D2.3 is submitted. 2.0 starts on Engineering Design, Physical Fabrication, Technical Documentation and Excluded Scope / Boundary Limits, 3.0 on the three phases and Overall Delivery Date, and 4.0 on D1.15's client dependency (Client Engineering Decision ...); every starting value can be changed, the hints read e.g. Section 2.1, Are boundaries tight enough? and e.g. 14 Days, and Add row gives the next SN (2.5, 3.5, 4.2) with a bin. Choose Approved in Operational Verification Status: Next Step Directive reads Proceed to Finance Review (D2.4); choose Revisions Required: it reads Return to Contract Admin for Edits. With Revisions Required, answer each row's Status, Workshop Feasible? and Adequately Protected?, press Sign on PM Signature and Submit: D2.3 reads Locked. Log in as the CA, ${loginFor("CA")}: the bell says D2.2 was sent back to you, and D2.2 is a draft again with the reason D2.3 sent it back: Revisions Required, its signature cleared and Iteration still 1. Sign and submit it: D2.2 locks as Iteration 2, and the PM's bell says D2.3 is open again; D2.3 is a draft with the PM's answers kept and the signature cleared. Choose Approved, sign and submit: D2.3 locks as Iteration 2. On a Tier 3 project D2.3 opens after T3.D2.2a: Reference Draft shows T3.D2.2a T3 Drafting Contract Mapping and 4.0 starts on one empty row; Revisions Required reopens T3.D2.2a for the OM, ${loginFor("OM")}, which the FO, the PM and the client sign again. The FO, the CA, the HE and the CR read D2.3 without editing; the OM and the client do not see it.`,
  },
  {
    screen: "D2.4 finance review draft, as the FO (RDP-183)",
    loginAs: "FO",
    path: (id) => `/projects/${id}/tools/D2.4`,
    expect: `${DEV_LOCKED} (Tier 1) and (Tier 3) have D2.4 locked as Approved and D2.5 as Approved for Client Transmission, with sample answers, D2.6 locked and D2.7 locked as Requested Negotiation, D2.8 locked, D2.9 locked as Terms Agreed, D2.10 locked, D2.11 locked as signed in the app, D2.12 and D2.13 locked, so D2.14 is open for the CA. D2.4 opens for the FO again only after D2.5 holds the draft for revision, the CA locks the revised D2.2 and the PM approves D2.3 again (below), or after D2.4 sends the draft back itself. As it starts on a project with D2.3 locked as Approved and nothing saved: 1.0: Assigned Finance Officer is ${staffWith("FO").name}, Date Received for Review is the day D2.3 locked, Project / Client Name names the project and ${client.organisation}, Reference Draft shows D2.2 Initial Draft Contract and PM Review (D2.3 Edits) shows D2.3 PM Review Draft, each with View, which opens its PDF beside the sheet, and Date Review Completed says Filled in when D2.4 is submitted. 2.0 starts on Total Contract Value (GHS) matches D1.15?, Minimum institutional overhead is recovered? and Currency and Tax (e.g. VAT/WHT) clearly stated?; row 2.2's Contract Clause Ref reads Yes, D1.14's Minimum overhead met, with a padlock, and cannot be typed in. 3.0 starts on the four payment milestones and 4.0 on the three risk protections. Every starting text can be changed, the hints read e.g. Section 3.1, e.g. Section 3.3.1 and e.g. Section 8.1, the starting rows have no bin, and Add row gives the next SN (2.4, 3.5, 4.4) with a bin. Choose Approved in Commercial Verification Status: Next Step Directive reads Proceed to Executive Review (D2.5); choose Revisions Required: it reads Return to Contract Admin for Edits. With Revisions Required, answer each row's Status, Cash Flow Safe? and Adequately Protected?, press Sign on Finance Officer Signature and Submit: D2.4 reads Locked and Date and Date Review Completed are today. Log in as the CA, ${loginFor("CA")}: D2.2 is a draft again with the reason D2.4 sent it back: Revisions Required. Sign and submit it: D2.2 locks as Iteration 2, D2.3 opens for the PM, ${loginFor("PM")}, with the reason D2.2 was revised after D2.4 sent it back: review it again, and D2.4 stays locked. The PM signs and submits D2.3 with Approved: the FO's bell says D2.4 is open again, and D2.4 is a draft with the FO's answers kept and the signature cleared. On a Tier 3 project Reference Draft shows T3.D2.2a T3 Drafting Contract Mapping, and Revisions Required reopens T3.D2.2a for the OM, ${loginFor("OM")}. Approved opens D2.5 for the HE. The PM, the CA, the HE and the CR read D2.4 without editing; the OM and the client do not see it.`,
  },
  {
    screen: "D2.5 executive review draft, as the HE (RDP-184)",
    loginAs: "HE",
    path: (id) => `/projects/${id}/tools/D2.5`,
    expect: `${DEV_LOCKED} (Tier 1) and (Tier 3) have D2.5 locked as Approved for Client Transmission with sample answers, D2.6 locked and D2.7 locked as Requested Negotiation, D2.8 locked, D2.9 locked as Terms Agreed, D2.10 locked, D2.11 locked as signed in the app, D2.12 and D2.13 locked, so D2.14 is open for the CA; on ${DEV_UNLOCKED} (Tier 1) D2.5 is open empty. As it starts on a project with D2.4 locked as Approved and nothing saved: 1.0: Reviewing Executive is ${staffWith("HE").name}, Date Received for Review is the day D2.4 locked, Project / Client Name names the project and ${client.organisation}, Reference Draft shows D2.2 Initial Draft Contract and Finance Review (D2.4 Finance Approved) shows D2.4 Finance Review Draft, each with View, which opens its PDF beside the sheet, and Overall Project Value is D1.15's total, GHS 94,400.00. 2.0 starts on the three sign-off checkpoints (PM Operational Approval (D2.3) complete and attached? ...) and 3.0 on Technical & Scope, Operational, Commercial and Legal & IP Risk, each with its assessment question. Every starting text can be changed, the starting rows have no bin, and Add row gives the next SN (2.4, 3.5) with a bin. 4.0 asks whether the project aligns with the 2026 strategy (Yes / No), and the justification box shows the sheet's example as a hint. Choose each Executive Decision in turn: Next Step Directive reads Proceed to D2.6 (Lock Draft) and D2.7 (Client Transmittal), Project Closed, or Return to Contract Admin for Edits. With Hold for Revision, answer each row's Status and the strategy question, press Sign on Head of R&D / Ops Signature and Submit: D2.5 reads Locked and Date is today. Log in as the CA, ${loginFor("CA")}: D2.2 is a draft again with the reason D2.5 sent it back: Hold for Revision. Sign and submit it: D2.2 locks as Iteration 2 and only D2.3 opens, for the PM, ${loginFor("PM")}; D2.4 and D2.5 stay locked. The PM approves D2.3: D2.4 opens for the FO, ${loginFor("FO")}. The FO approves D2.4: the HE's bell says D2.5 is open again, with the answers kept and the signature cleared. Rejected locks D2.5 and closes the project, so nothing else can start on it. Approved for Client Transmission locks D2.5 and opens D2.6 for the CA. On a Tier 3 project Reference Draft shows T3.D2.2a T3 Drafting Contract Mapping and the value is T3.D1.15a's total. The PM, the FO, the CA and the CR read D2.5 without editing; the OM and the client do not see it.`,
  },
  {
    screen: "D2.6 internally approved draft, as the CA (RDP-185)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.6`,
    expect: `On Dev: Test D2.6 Internally Approved Draft (Tier 1), where D2.5 is locked as Approved for Client Transmission, D2.6 is open for the CA. 1.0: Lock Executed By (Admin), Date Locked and the 4.0 Date say Filled in when D2.6 is submitted, Executive Approval Ref shows D2.5 Executive Review Draft with View, which opens its PDF beside the sheet, and Project / Client Name names the project and ${client.organisation}. 2.0 lists Total Contract Value (GHS), Advance Payment %, Total Project Timeline and Warranty / Support SLA, which cannot be changed; Baseline Value starts on D2.2's GHS 94,400.00 and 8 weeks, and Advance Payment % and Warranty start empty with the hints e.g. 40% and e.g. 30 Days Post-Delivery. Absolute Limit starts empty with the sheet's hints (e.g. Absolute minimum 35% to cover initial BOM ...), and none on 2.1. Add row gives 2.5 with a bin. 3.0 lists the three archive tasks, each assigned to Contract Admin, which cannot be changed, with Status Pending / Done. Leave a task Pending or answer No to Baseline Locked and Ready for Transmittal (D2.7)? and press Submit: it is refused with Mark every task Done before locking the baseline or Answer Yes once the baseline is ready for transmittal. Mark every task Done, answer Yes, press Sign on Contract Admin Signature and Submit: it says Submitted and locked, Lock Executed By is you and the dates are today, and there is no Request a change, here or on the project page, because the baseline can never change. On Dev: Test D2.6 Internally Approved Draft (Tier 3) 2.1 starts on T3.D1.15a's total and Total Project Timeline starts empty. The PM, the FO, the HE and the CR read D2.6 without editing; the OM and the client do not see it.`,
  },
  {
    screen: "D2.7 client transmitted record, as the CA (RDP-186)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.7`,
    expect: `On ${testProjectName("Tier_1", "D2.7")}, where D2.6 is locked, D2.7 is open for the CA. 1.0: Sent To (Client Email) is ${client.email}, Subject Line reads IMHO GEN Engineering Services Agreement - followed by the project's name and cannot be typed in, Sent By, Date Sent and Time Sent say Filled in when the email is sent, File Attached shows D2.2 Initial Draft Contract with View, and Quote Expiry Date is 30 days from today. 2.0's script starts Dear ${client.organisation} and names the project, with the sheet's sentence cut short after supply chains. Send is greyed out with Send needs: choose whether to follow up after 3 days. Type an address in CC / BCC, pick Yes for the follow-up and press Send: it says Sent, Sent By is you, Date Sent and Time Sent are now, Follow-Up Date is 3 days on, and Link to Sent Email has Open, which shows the email as it went out: to, CC, subject, the script and the PDF's name. CC / BCC, Quote Expiry Date, the script and the follow-up now read as text; Initial Client Response stays a choice. Press Submit while it is Pending: it is refused with Record the client's reply before submitting. Choose Accepted as-is or Requested Negotiation and Submit: D2.7 locks. With the Inngest dev server running, three days after sending with the reply still Pending, the client is reminded and the CA's bell says so. On ${testProjectName("Tier_3", "D2.7")} File Attached shows T3.D2.2a T3 Drafting Contract Mapping. The PM, the CR and the client read D2.7 without editing; the OM does not see it.`,
  },
  {
    screen: "D2.8 negotiation meeting invite, as the CA (RDP-187)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.8`,
    expect: `On ${testProjectName("Tier_1", "D2.8")}, where D2.7 is locked with the client's reply Requested Negotiation, D2.8 is open for the CA. Project Request ID shows the project's request ID. 1.0's six fields start empty, with the hints e.g. Google Meet / HQ, e.g. Lead PM & Head of R&D and Type names; the time is Ghana time (GMT). 2.0: Reference Document shows D2.6 Internally Approved Draft with View, which opens its PDF beside the sheet, Client's Stated Concerns starts empty with the sheet's hint, and IMHOGEN Hard Limits starts on D2.6's limits, one line each, such as Advance Payment %: 35%. 3.0's script starts Dear ${client.organisation}, names the project, and still holds [Insert 1-2 words on their concern,e.g.,the delivery timeline] and [Proposed Date & Time]. 4.0: Calendar Invite Sent to Client? reads No and cannot be picked. Send calendar invite is greyed out with Send calendar invite needs: add the proposed date; add the meeting time; add the platform or location; replace [Insert 1-2 words ...] in the script. Pick a date and time ahead, type a platform, replace the concern bracket and press Send calendar invite: it says Invite sent, the script now reads the date and time (e.g. Tue, 1 Dec 2026, 10:00 GMT) and can no longer be typed in, and Calendar Invite Sent to Client? reads Yes. The client, ${client.email}, gets one email with the script and invite.ics, and the CA a copy (with no RESEND_API_KEY set, it is only recorded in the email log). Press it again: nothing new is sent. Change the time and press it again: an update to the same meeting goes, and the script reads the new time. Press Submit with any 4.0 answer No: it is refused with Answer Yes once the client has confirmed the meeting (and the others). Answer all Yes and Submit: it says Submitted and locked, and D2.8 reads Locked. Log in as the client, ${client.email}: D2.8 shows 1.0, 3.0 and 4.0 but no 2.0, and Export PDF has no 2.0 either. The PM, the LO and the CR read all of D2.8 without editing; the OM and the FO do not see it. On ${ACCEPTED_AS_IS_PROJECT}, where the client accepted the draft as it is, D2.8 never opens. ${testProjectName("Tier_3", "D2.8")} works the same on Tier 3.`,
  },
  {
    screen: "D2.9 negotiation meeting notes, as the CA (RDP-188)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.9`,
    expect: `On ${testProjectName("Tier_1", "D2.9")}, where D2.8 is locked, D2.9 is open for the CA. Project Request ID shows the project's request ID and Actual Date starts on D2.8's proposed date, 1 Dec 2026, and can be changed; Start / End Time shows the hint 00:00 to 00:00, and the two negotiator names start empty. 2.0 and 3.0 each start on one empty row with the sheet's examples as hints (e.g. Sec 3.1 - Total Value, e.g. Client Legal Team); Add row in 2.0 gives the next SN (2.2, 2.3) with a bin, and 3.0's rows can be added and removed. Date says Filled in when the Lead Negotiator signs. Press Submit with no Meeting Outcome, an empty 2.0 cell or no signature: it is refused. Fill a 2.0 row, choose Terms Agreed - Proceed to D2.10, press Sign on Lead Negotiator Signature (Date is today) and Submit: it says Submitted and locked. On ${testProjectName("Tier_3", "D2.9")}, choose Deadlock - Escalate instead: D2.9 locks and D2.8 is a draft again with the reason D2.9 sent it back: Deadlock - Escalate; the HE, ${loginFor("HE")}, and the PM, ${loginFor("PM")}, each see D2.8 is open again on their bell and get an email (with no RESEND_API_KEY set, it is only recorded in the email log). Submit D2.8 again: it locks as Iteration 2 and D2.9 opens again as a draft for the next meeting. Client Withdrawn locks D2.9 and closes the project, so nothing else can start on it. Log in as the client, ${client.email}: D2.9 shows 2.0 without IMHOGEN's Baseline Limit (From D2.6), and Export PDF leaves it out too. The PM, the HE and the CR read all of D2.9 without editing; the OM and the FO do not see it.`,
  },
  {
    screen: "D2.10 finalized contract, as the CA, and the FO to sign (RDP-189)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.10`,
    expect: `On ${testProjectName("Tier_1", "D2.10")}, where D2.9 is locked with Terms Agreed, D2.10 is open for the CA. 1.0: Project Request ID shows the project's request ID, Edited By and Date of Final Edit say Filled in when D2.10 is submitted, Reference Meeting Notes shows D2.9 Negotiation Meeting Notes with View, and Project / Client Name names the project and ${client.organisation}. 2.0 starts on D2.9's two agreed resolutions (Agreed to a discount down to the walk-away floor, IMHOGEN held firm at 7 weeks), each Pending, with the hints e.g. Section 3.1 and e.g. "Total Contract Value is GHS 164,825.00"; Add row gives 2.3 with a bin. 3.0 asks whether the new pricing recovers minimum overhead and has a Finance Rep signature the CA cannot press. 4.0 starts on the two export and naming tasks for the Contract Admin, each Pending, and they cannot be changed. Type in a 2.0 cell to start the record: the FO, ${loginFor("FO")}, gets a bell notice and an email that D2.10 is waiting for their signature (with no RESEND_API_KEY set, it is only recorded in the email log). Log in as the FO: D2.10 reads without editing, but Sign on Finance Rep works and shows the date. Any edit after signing clears both signatures, so the CA finishes 2.0, 4.0 and 5.0 before the FO signs. Back as the CA, press Submit while a 2.0 row or 4.0 task is Pending, 5.0 is No, or a signature is missing: it is refused. Mark everything Updated and Done, answer Yes, Sign and Submit: it says Submitted and locked, and Edited By and Date of Final Edit fill in. On ${ACCEPTED_AS_IS_PROJECT}, where the client accepted the draft as it is, D2.10 was locked straight after D2.7 with an empty 2.0 and no 3.0, without the FO (on a project of your own that skipped negotiation, it opens that way with Reference Meeting Notes saying Not started). ${testProjectName("Tier_3", "D2.10")} works the same on Tier 3. The PM, the FO, the HE, the CR and the client read D2.10 without editing; the OM does not see it.`,
  },
  {
    screen:
      "D2.11 pending signature contract, as the CA, then the client and the HE to sign (RDP-190)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.11`,
    expect: `On ${testProjectName("Tier_1", "D2.11")}, where D2.10 is locked, D2.11 is open for the CA. 1.0: Project Request ID shows the request ID, Routing Method starts on Digital Signature, Sent To (Client Signatory) shows the client contact's name and email, IMHOGEN Signatory shows ${staffWith("HE").name}, Head of Engineering, Date Dispatched and Link to Signature Platform say they fill in when it is sent, and Final Contract PDF has Upload (PDFs only). 2.0's script starts Dear ${client.organisation}, says You can click the link below to review and sign the document digitally, and ends with your name | IMHOGEN LTD. 3.0 shows ${client.name} as Client Representative and ${staffWith("HE").name} as IMHOGEN Representative, each Pending, and cannot be typed in; the Client Signature and IMHOGEN Signature below it have no Sign button yet. 4.0's question reads No; Action Taken shows the hint e.g. Called Client. Send is greyed out with Send needs: choose whether to remind the client; upload the final contract as a PDF. Pick Yes for Auto-Reminder, upload a PDF and press Send: it says Sent for signature, Date Dispatched is today, Link to Signature Platform has Open, and 1.0, 2.0 and the PDF read as text (the PDF still opens). The client, ${client.email}, gets one email with the PDF attached and the link (with no RESEND_API_KEY set, it is only recorded in the email log). Log in as the client: their bell says D2.11 is waiting for their signature; opening D2.11 fills 3.0's Date Viewed on their row; they can open the PDF and press Sign on Client Signature, but nothing else; their row reads Signed with today's date. Log in as the HE, ${loginFor("HE")}: the bell and an email say D2.11 is waiting for your signature; Date Viewed fills on the second row, and Sign on IMHOGEN Signature locks D2.11. Before the client signs, the HE has no Sign button. With the Inngest dev server running, the client is reminded every 3 days until they sign; if a signature is still missing 7 days after sending, 4.0 reads Yes and the CA and PM are told. On ${testProjectName("Tier_3", "D2.11")}, choose Physical Courier before sending instead: the email has no link, there are no Sign buttons, and after sending the CA types both Date Signed, sets both rows Signed and presses Submit, which locks it. Submit is refused for Digital Signature. The PM and the CR read D2.11 without editing; the OM does not see it.`,
  },
  {
    screen:
      "D2.12 executed contract & audit trail, as the CA, then the PM to approve (RDP-194)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.12`,
    expect: `On ${testProjectName("Tier_1", "D2.12")}, where D2.11 is locked after both sides signed in the app, D2.12 is open for the CA. 1.0 is all the system's: Project Request ID, Date Fully Executed (the day the HE signed, 6 Dec 2026), Project / Client Name, Client Signatory ${client.name}, IMHOGEN Signatory ${staffWith("HE").name}, Head of Engineering, Total Contract Value GHS 94,400.00 and Advance Payment Due GHS 37,760.00 (D2.1's 40%). 2.0: Document Platform Used starts on IMHOGEN App (Digital Signature). The seed has no uploaded contract, so Link to Executed PDF and Link to Digital Audit Certificate start empty with Upload (PDFs only); after signing a real uploaded contract in D2.11 (with UPLOADTHING_TOKEN set), they start on the contract with an Execution page added and on the signing log, each with Open. 3.0 starts on the two Finance tasks, assigned to the Contract Admin and the Finance Officer, each Pending; the tasks and assignees cannot be changed. Invoice Number Issued shows the hint e.g. IMHO-INV26-ADV-010. Press Submit with a file missing, a task Pending, no invoice number or date, 4.0 No or no signature: it is refused. Upload both PDFs, mark both tasks Done, type the invoice number and date, answer Yes, Sign and Submit: it waits for the PM. Log in as the PM, ${loginFor("PM")}: Approve locks D2.12, which opens Workbook 3; Send back returns it to the CA. On ${PAPER_SIGNED_PROJECT}, signed on paper, D2.12 is locked with Physical Scan, Date Fully Executed is the later paper date (8 Dec 2026), and no certificate was asked for. ${testProjectName("Tier_3", "D2.12")} works the same on Tier 3, with T3.D1.15a's total. The FO, the HE, the CR and the client read D2.12 without editing; the OM does not see it.`,
  },
  {
    screen: "D2.13 archived contract record, as the CA (RDP-191)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.13`,
    expect: `On ${testProjectName("Tier_1", "D2.13")}, where D2.12 is locked, D2.13 is open for the CA. 1.0: Project Request ID, Archived By and Archive Date say Filled in when D2.13 is submitted, Project / Client Name names the project and ${client.organisation}, and Permanent Vault Folder Link has Open, which goes to the archive page. 2.0 lists five documents, 2.1 to 2.5: D1.15 Project Brief & Draft Budget, D2.6 Internally Approved Draft, D2.9 Negotiation Meeting Notes, D2.12 Executed PDF and D2.12 Digital Audit Certificate, each with View, which opens its PDF beside the sheet, Status Pending, and a fixed file name such as IMHO_Brief_ClientTestLtd.pdf. (The seed's executed contract and certificate are web links, so their View opens nothing real; after a real upload in D2.12 they open the PDF.) Add row gives 2.6 with a bin. Press Submit with a row Pending, 3.0 No or no signature: it is refused. Mark all Done, answer Yes, Sign and Submit: it says Submitted and locked, and Archived By and Archive Date fill in. On ${ACCEPTED_AS_IS_PROJECT}, where nobody negotiated, D2.13 is locked with row 2.3 reading Not needed in place of its status (Submit does not wait for it); on ${PAPER_SIGNED_PROJECT}, signed on paper, row 2.5 does. ${testProjectName("Tier_3", "D2.13")} shows T3.D1.15a T3 Drafting SOW & Quote in row 2.1. The PM and the CR read D2.13 without editing; the client and the OM do not see it.`,
  },
  {
    screen: "Contract archive page, as the CA (RDP-191)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/archive`,
    expect: `On ${testProjectName("Tier_1", "D2.13")}, the archive lists the five documents of D2.13's 2.0, each with its standard file name, such as IMHO_Brief_ClientTestLtd.pdf, View, which opens it beside the list, and Download, which saves it under that name. A document whose tool is not locked yet says Not started; a document the project does not need says Not needed. The PM and the CR see the archive too; the client and the OM get not found.`,
  },
  {
    screen:
      "D2.14 phase initiation notice, as the CA, then the FO and the PM to sign (RDP-192)",
    loginAs: "CA",
    path: (id) => `/projects/${id}/tools/D2.14`,
    expect: `On ${testProjectName("Tier_1", "D2.14")}, where D2.13 is locked, D2.14 is open for the CA. 1.0: Project Request ID, Notice Date says Filled in when D2.14 is submitted, Project / Client Name names the project and ${client.organisation}, Assigned Project Manager is ${staffWith("PM").name}, and Total Project Timeline is D2.6's 8 weeks. 2.0: Advance Invoice Number starts on D2.12's IMHO-INV26-ADV-010 and Amount Expected on D2.1's 40% of the contract total, GHS 37,760.00; both can be changed. Finance Clearance Signature has no Sign button for the CA. Pick the day the payment cleared: Official Project Start Date (Day 1) follows it, and Target Delivery Date is 8 weeks (56 days) on; change either by hand and it stops following. Link to Executed Contract has View (the seed's contract is a web link, so it opens nothing real). 4.0 starts on the two tasks, each Pending; the Project Manager's reads as text and cannot be chosen. Press Submit with a field empty, the first task Pending or 5.0 No: it is refused. Fill everything, mark the first task Done, answer Yes and press Submit for approval. Log in as the FO, ${loginFor("FO")}: the bell and an email say D2.14 is waiting for their signature; Sign on Finance Clearance Signature. Then the PM, ${loginFor("PM")}, is told and signs Head of Operations / R&D Signature: D2.14 locks, the PM's task reads Done, and Date is today. The PM cannot sign before the FO. ${testProjectName("Tier_3", "D2.14")} works the same on Tier 3, with T3.D1.15a's total. The FO, the PM and the CR read D2.14 without editing; the client and the OM do not see it.`,
  },
  {
    screen:
      "D3.1 payment terms extract, as the FO, then the PM to approve (RDP-195)",
    loginAs: "FO",
    path: (id) => `/projects/${id}/tools/D3.1`,
    expect: `On ${testProjectName("Tier_1", "D3.1")}, where D2.12 is locked, D3.1 is open for the FO under Payments. 1.0: Project Request ID, Extracted By (Admin) and Extraction Date say Filled in when D3.1 is submitted, Link to Executed PDF and Reference Contract each have View (the seed's executed contract is a web link, so the first opens nothing real; the second opens D2.12 as a PDF beside the sheet), Project / Client Name names the project and ${client.organisation}, and Total Project Value (GHS) is the contract total, GHS 94,400.00. 2.0 starts on three rows, 2.1 Advance Payment (Contract Signing) at D2.1's 40% with Amount Due GHS 37,760.00, then Fabrication Milestone (Design Approval) and Final Handover (System Delivery) with no percentage; every description can be changed and each Contract Clause Ref shows e.g. Section 3.3.1. Type 40 in row 2.2: its Amount Due reads GHS 37,760.00 at once. Add row gives 2.4 with a bin, and its Amount Due follows its percentage the same way. 3.0 starts on Invoice Payment Window, Late Payment Penalty, Tax / VAT Obligations and Accepted Currency, whose categories cannot be changed, with the sheet's agreed terms (Accepted Currency reads Ghana Cedis (GHS) ONLY), which can; Add row gives 3.5, where the category is typed too. Press Submit while the percentages do not add up to 100, a clause ref is empty, 4.0 is No or nobody signed: it is refused. Make them 100, fill every clause ref, answer Yes, Sign on Finance Officer Signature and Submit: Extracted By and Extraction Date fill in. Log in as the PM, ${loginFor("PM")}: Approve locks D3.1, or Send back returns it to the FO. ${testProjectName("Tier_3", "D3.1")} works the same on Tier 3, with T3.D1.15a's total. The PM, the CA, the CR and the client read D3.1 without editing; the OM and the HE do not see it.`,
  },
  {
    screen: "Testing any one tool",
    loginAs: "PM",
    path: () => "/",
    expect: `Your projects lists a Dev: Test project for every tool after D1.1 on each tier, such as Dev: Test D2.4 Finance Review Draft (Tier 1). Open one and its tool is open and empty, with every tool before it locked with sample answers, so the tool starts from them: D2.4's Reference Draft and PM Review open their PDFs, and D2.6's baselines start from D2.2's figures. Log in as the role that writes the tool to fill it in, and as the others to read it. bun run db:reset puts every project back as seeded.`,
  },
  {
    screen: "Every tool built, locked or open",
    loginAs: "OM",
    path: () => "/",
    expect: `${DEV_LOCKED} (Tier 1) and (Tier 3) have every tool built locked with sample answers, except D2.14, open on both for the CA to record the phase initiation, and D3.1, open on both for the FO to extract the payment terms: open any tool as any role to see what that role reads. ${DEV_UNLOCKED} (Tier 1) and (Tier 3) have every tool of their tier open at once, empty, without waiting for the one before (development only, never in production): the client's web form is a draft the client can change, and every other tool starts from nothing. A tool that reads an earlier one, such as D1.6 reading D1.5's agreed time, says what it is missing until that one is filled in. D1.4 is sent by the PM: the OM prepares the email, the PM presses Send, and the D1.4 tile shows a Sent chip that turns Delivered once the Inngest dev server runs the delivery check.`,
  },
  {
    screen: "Unpicking a chosen option (RDP-154)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), D1.2: press Reject as Spam, then press it again: neither decision is chosen. Press Proceed, then Reject: it switches in one press. With neither chosen, Submit for approval says Choose a triage decision to submit, and nothing is sent. Save draft with neither chosen and reload: still neither. Tab to a chosen decision and press Space: it lets go. Pass and Fail in the checks, Yes and No answers and every other one-of-a-few choice let go the same way.`,
  },
  {
    screen: "Sending D1.2 back (RDP-157)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), log in as the OM, ${loginFor("OM")}, fill in D1.2 and press Submit for approval. Then, as the PM, ${loginFor("PM")}, the submitted D1.2 has Send back beside Approve. Send back opens What needs changing?; Send back to the writer stays off until a reason is typed, then says Sent back to the writer. As the OM again, D1.2 is editable with Sent back for changes and the PM's reason at the top. Change it and submit again: the PM sees Approve and Send back once more.`,
  },
  {
    screen: "The PM as Checked by on D1.2 and D1.4 (RDP-159)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), log in as the OM, ${loginFor("OM")}, fill in D1.2 and press Submit for approval: the top bar's Checked by already names the project's PM, and Date checked is still empty. As the PM, ${loginFor("PM")}, press Approve: Checked by still names the PM, with PM beside the name, and Date checked shows when they approved. D1.4 does the same once the PM presses Send, and so does each tool's Export PDF. D1.3 and D1.8 name their approver as before.`,
  },
  {
    screen: "Projects that need a team (IT/Admin)",
    loginAs: "IT/Admin",
    path: () => "/admin/team",
    expect: `${NEEDS_TEAM} is the one running project with nobody on it. Open it to assign people: one of each role is free to take it, since the test projects take up nobody's workload slot. Assign staff in the sidebar has an orange count of 1.`,
  },
  {
    screen: "Every project as IT/Admin",
    loginAs: "IT/Admin",
    path: () => "/",
    expect:
      "Every project, Tier 1 and Tier 3. The IT/Admin holds no project role, so no project shows Your roles.",
  },
  {
    screen: "Project tree in the sidebar",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "On a wide screen, the left sidebar lists the 13 workbooks as folders (Onboarding (WB01), Contracting (WB02) and so on). Onboarding is open with its tools as links, each marked with its state. Click a tool to open it. The tree stays on the tool page, with the open tool highlighted. Each tool has a mark: grey dots when not started, orange dots moving clockwise while someone works on it, a solid orange square once locked, and a lock at the right that is open until the tool is locked. A tool that cannot open yet, because the one before it is not locked, is greyed out and is not a link; on the overview its tile says Opens after and the tool it waits on, and typing its address leads back to the overview.",
  },
  {
    screen: "Client sign-up and confirm email",
    loginAs: "Client",
    email: "nobody: sign up with an email you can open",
    path: () => "/sign-up",
    expect:
      "Create your account asks for full name, email and password; the sign-in page links here with Create an account. Create account opens Check your email with the address and Send the link again; signing in before confirming opens it too. The link really is emailed (an address ending in .test or example.com never is). Once confirmed, the client lands on Your projects with only Start new project, and any website request made with that email is already theirs.",
  },
  {
    screen: "Form tools on the same sheet (dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Plain fields sit together in a Details table (Field | Answer). Tables, checklists and read-only blocks each get their own titled box with the same ruled lines. Save draft and Submit for approval sit in the action row at the foot. The same boxes are used by every tool that is a form, such as D1.3 once D1.2 is approved.",
  },
  {
    screen: "Tables with locked and added rows (RDP-144, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect:
      "Find the table Locked and added rows. Its two rows, Primary purpose and Main deliverables, show a lock and have no Remove button. Press Add row: a third row opens with an editable name and a Remove button. D1.3 and T3.D1.3a use this table for their own tables once the OM can open them.",
  },
  {
    screen: "Sidebar avatar and sign out, rounded buttons",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect:
      "At the foot of the sidebar: a rounded avatar with the person's initials, and a rounded sign-out icon at the right. Hover or tab to the avatar: a tooltip says Signed in as and the name. Buttons and badges across the app are rounded; the grid boxes and tables stay square.",
  },
  {
    screen: "Client: start a new project",
    loginAs: "Client",
    email: client.email,
    path: () => "/",
    expect:
      "The client sees their projects, and the last square of the grid is Start new project with a plus. Press it, choose Tier 1 (Custom Engineering & Factory Solutions) or Tier 3 (Engineering Drafting & Digitization), and fill the same form as on the IMHOGEN website. File attachments has Add files: choose images or PDFs and each uploads at once, listed by name with a cross to remove it (needs UPLOADTHING_TOKEN). Send request creates the project with D1.1 locked and opens it; it waits for the IT/Admin to assign a team. D1.1 lists the files by name, and Open file opens each one.",
  },
  {
    screen: "Change requests on the project overview",
    loginAs: "PM",
    path: (id) => `/projects/${id}`,
    expect: `On ${approved}, the PM sees Change requests waiting above the workbooks: the OM asks to change D1.1 Client Email / Web Form because the client sent a photo of the equipment nameplate. Approve or Reject sits beside it. The D1.1 tile below says Change requested.`,
  },
  {
    screen: "The client changed their request (RDP-155)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.1`,
    expect: `On ${DEV_LOCKED} (Tier 1): as the OM, ${loginFor("OM")}, ask for a change to D1.1 on the project overview; as the PM, approve it. As the client, ${client.email}, open D1.1, change Title and Timeline, add or take off a file (needs UPLOADTHING_TOKEN to add), and press Send the changes. The PM and the OM each get a bell note, The client changed their request on ${DEV_LOCKED} (Tier 1); clicking it opens D1.1. There Title and Timeline are tinted, each with Was: and the old answer under it; the rest read as before; Changed files lists each file as Added or Removed. The tint stays until the next change request on D1.1 is approved.`,
  },
  {
    screen: "Withdraw a submitted tool, as the OM (RDP-152)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), fill in D1.3 and press Submit for approval. Withdraw appears at the foot of the sheet. Press it: it asks Take this back to fix it? Press Yes, withdraw: D1.3 is a draft again with Save draft and Submit for approval, and the Iteration stays the same. The PM, ${loginFor("PM")}, sees no Withdraw on a D1.3 the OM submitted, and after a withdraw their waiting for approval note is read. D1.2 offers the same Withdraw once submitted.`,
  },
  {
    screen: "Request a change from a locked tool, as the OM (RDP-152)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.3 is locked and shows Request a change at the foot of the sheet, and no Withdraw. Press it, give a reason and Send request: the button goes and Change requested shows next to the Locked badge. The PM decides it on the project page.`,
  },
  {
    screen: "Iteration after a change request (RDP-156)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.3`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.3's top bar shows Iteration 1. Press Request a change and send it. The PM, ${loginFor("PM")}, approves it on the project page. Back on D1.3 the OM edits and submits, and the PM approves: the top bar now shows Iteration 2. A send back and resubmit still raises it by 1 as before; a withdraw does not.`,
  },
  {
    screen: "Comments on a tool (RDP-158)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.2 ends with a Comments box: the PM's question with the OM's reply indented under it, each with the name, role in full and time, and Reply and Resolve; under it a folded "Resolved by" thread that opens when pressed; then Add a comment. Write a comment and press Comment: the OM, ${loginFor("OM")}, gets a New comment on D1.2 notification that opens D1.2 at the comment. Their reply gives the PM a New reply notification. Every tool, locked or not, has the box; the client never sees it.`,
  },
  {
    screen: "Every tool saves by itself (RDP-153)",
    loginAs: "OM",
    path: (id) => `/projects/${id}/tools/D1.2`,
    expect: `On ${DEV_UNLOCKED} (Tier 1), D1.2 has no Save draft, only Submit for approval. Type a reviewer note: a moment later the foot says Saving… then ✓ Saved. Click Project overview and come back: the note is there. Type and click away at once: it saves on the way and goes. With the network off (browser dev tools, Offline), typing shows Not saved. Retrying…, and clicking a link asks Your latest changes are not saved yet. Leave anyway? with Leave and Stay; back online it saves by itself. Every other tool, D1.5 and D1.6 among them, saves the same way.`,
  },
  {
    screen: "Export a tool as a PDF (RDP-162)",
    loginAs: "PM",
    path: (id) => `/projects/${id}/tools/D1.14`,
    expect: `On ${DEV_LOCKED} (Tier 1), D1.14's top bar has Export PDF at the right. Press it: a file named D1.14 Cost Estimation Sheet - Dev- Every Tool Locked (Tier 1).pdf downloads (a colon or slash in a name becomes -). It starts with the tool's ID and name, the project and Locked, then the document control (request ID, prepared by, checked by, dates, iteration). Each section follows with the sheet's own title and order: fields as label and answer, tables as tables whose long text wraps, the totals the sheet works out, signatures as who signed and when, files by name, and — for an empty answer. Every page is A4 with Page 1 of N at the foot. Every tool with a record has the button, a draft too (try any tool on ${DEV_UNLOCKED} (Tier 1) once something is typed). A tool with no record has none, and the client gets none on a tool IMHOGEN shares only once it is approved.`,
  },
  {
    screen: "PDF preview field (RDP-163, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview",
    expect: `Near the foot, the Appendices box has three rows. Appendix A: D1.15 Project Brief & Draft Budget has View: press it and a panel slides in from the right (half the screen on a wide one, all of it on a phone) with ${DEV_LOCKED} (Tier 1)'s D1.15 as a PDF that scrolls through every page, then Download (saves the file) and Open (a new tab). Appendix B has View greyed and says Not started; Appendix C has View greyed and says No access. Log in as the HE, ${loginFor("HE")}, who may not read D1.15: Appendix A says No access too, and its address, /api/projects/<project id>/tools/D1.15/pdf, answers not found. D2.1's appendices use the same field once that tool is built.`,
  },
  {
    screen: "PDF preview field on a Tier 3 project (RDP-181, dev preview)",
    loginAs: "PM",
    path: () => "/dev/form-preview?tier=3",
    expect: `The preview reads ${DEV_LOCKED} (Tier 3). Appendix A still names D1.15 in its label, but View opens a panel headed T3.D1.15a T3 Drafting SOW & Quote, the tool Tier 3 uses in its place, with T3.D1.15a's record as a PDF; Download saves a file named after T3.D1.15a. Its address, /api/projects/<project id>/tools/T3.D1.15a/pdf, gives the PDF, and so does the D1.15 address on this project; on ${DEV_LOCKED} (Tier 1) the T3.D1.15a address answers not found. Without ?tier=3 the page shows D1.15 exactly as before. Log in as the HE, ${loginFor("HE")}, who may not read T3.D1.15a: Appendix A says No access.`,
  },
  {
    screen: "Notification bell (RDP-115)",
    loginAs: "PM",
    path: () => "/",
    expect: `A bell at the top right of the sidebar header (on a narrow screen, in the top bar) with a number on it: one unread note for each project where ${CURRENT_TOOL} waits for the ${approver}'s approval, and one for the change waiting on ${approved}, then older read notes. Click one: you go to its page and the number drops by 1. Mark all read clears them. The OM, ${loginFor("OM")}, has no notifications.`,
  },
]
