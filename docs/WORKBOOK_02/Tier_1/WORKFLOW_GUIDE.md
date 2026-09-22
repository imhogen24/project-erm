# Workbook 02 (Contracting) — Tier 1 Workflow Guide

This workbook starts once D1.16 is signed in Workbook 01, and ends at
D2.14, which is the hard gate that unlocks Workbook 03. Engineering
work cannot start until the advance payment is confirmed.

---

### D2.2 — Initial Draft Contract

- **Why:** draft the actual contract from the approved brief and D2.1's
  boilerplate clauses.
- **App does:** pre-fills client, PM, and project value from
  D1.3/D1.15/D1.16; pulls D2.1's standard clauses and carries D1.16's
  risk/exclusion directives into the draft.
- **Staff does (Contract Admin):** maps the contract variables
  (signatory, value, milestones) into the boilerplate; verifies
  appendices are attached; signs off the draft as complete.
- **Client does:** nothing.
- **Unlocks:** D2.3.

### D2.3 — PM Review Draft

- **Why:** PM checks the draft matches the agreed scope and timeline.
- **App does:** pre-fills PM and client name; links to D2.2.
- **Staff does (PM):** checks scope, timeline, and client dependencies
  against the contract text; decides Approved or Revisions Required;
  signs.
- **Client does:** nothing.
- **Unlocks:** Approved → D2.4. Revisions Required → back to Contract
  Admin.

### D2.4 — Finance Review Draft

- **Why:** Finance checks the numbers and payment terms are safe.
- **App does:** pre-fills client name; links the PM-reviewed draft.
- **Staff does (Finance):** checks value/margin, payment schedule and
  cash flow, and financial risk clauses; decides Approved or Revisions
  Required; signs.
- **Client does:** nothing.
- **Unlocks:** Approved → D2.5. Revisions Required → back to Contract
  Admin.

### D2.5 — Executive Review Draft

- **Why:** final internal authorization before the contract goes to the
  client.
- **App does:** pre-fills client name and project value; links the
  finance-approved draft.
- **Staff does (Executive):** confirms PM and Finance sign-offs are in;
  reviews risk by category; confirms strategic alignment; makes the
  final call — Approved / Rejected / Hold for Revision; signs.
- **Client does:** nothing.
- **Unlocks:** Approved → D2.6. Rejected or Hold → project closed or
  held.

### D2.6 — Internally Approved Draft

- **Why:** freeze the walk-away limits before anything reaches the
  client — this becomes the negotiation floor.
- **App does:** pre-fills client name and the D2.5 approval reference;
  the baseline record is immutable once locked.
- **Staff does (Contract Admin):** records the baseline value and
  absolute walk-away limit for each contract variable; exports the
  draft as a locked PDF; signs.
- **Client does:** nothing.
- **Unlocks:** D2.7.

### D2.7 — Client Transmitted Record

- **Why:** send the locked contract to the client and log their
  response.
- **App does:** pre-fills the client email and the exact filename from
  D2.6.
- **Staff does:** personalizes and sends the contract using the
  provided email script; sets the quote expiry date; records the
  client's response once it arrives.
- **Client does:** reviews the contract; responds — accepts as-is, or
  requests negotiation.
- **Unlocks:** "Accepted as-is" → D2.11 directly. "Requested
  Negotiation" → D2.8.

> Unlike D1.4, this send is staff-initiated, not system-automated — the
> schema gives a copy-paste script with blanks for a human to fill in,
> and there's no delivery-status field tracked from an email provider.

### D2.8 — Negotiation Meeting Invite *(only if client requested negotiation)*

- **Why:** schedule the negotiation meeting and brief the negotiating
  team on IMHOGEN's limits.
- **App does:** carries forward D2.6's baseline and hard limits.
- **Staff does:** proposes meeting details; records the client's stated
  concerns; runs the internal pre-meet; sends the invite (script
  provided); confirms it was sent and the client RSVP'd.
- **Client does:** receives the invite; confirms attendance.
- **Unlocks:** D2.9.

### D2.9 — Negotiation Meeting Notes *(only if client requested negotiation)*

- **Why:** capture the actual negotiation, clause by clause, against
  IMHOGEN's walk-away limits.
- **App does:** provides the note-taking template.
- **Staff does:** logs each clause negotiated (client's ask, IMHOGEN's
  limit, final resolution); logs unresolved items; records the
  outcome; signs.
- **Client does:** negotiates in the meeting.
- **Unlocks:** "Terms Agreed" → D2.10. "Deadlock" → escalate to Head of
  R&D. "Client Withdrawn" → project closed/lost.

### D2.10 — Finalized Contract *(only if terms were agreed in D2.9)*

- **Why:** apply the negotiated changes to the actual contract text and
  re-check the numbers still hold.
- **App does:** links back to D2.9's meeting notes.
- **Staff does:** logs every agreed concession with the exact new
  wording; if pricing changed, Finance re-checks minimum overhead is
  still met and signs that part; exports the final locked PDF; signs.
- **Client does:** nothing.
- **Unlocks:** D2.11 — blocked if pricing changed and overhead is no
  longer met; Finance must review.

### D2.11 — Pending Signature Contract

- **Why:** get the contract formally signed by both sides.
- **App does:** routes for signature (DocuSign or physical); tracks
  each signatory's viewed/signed status.
- **Staff does:** chooses the routing method; sends the signature
  request (script provided); if signature is pending too long, decides
  what escalation action to take.
- **Client does:** reviews and signs.
- **Unlocks:** D2.12, once both parties have signed.

> **Open item:** whether "pending over 7 days" and the reminder are
> calculated/sent by the app automatically, or checked manually, isn't
> decided — the app already knows the dispatch date, so this is a
> candidate for automation.

### D2.12 — Executed Contract & Audit Trail

- **Why:** record the fully signed contract and trigger the advance
  invoice.
- **App does:** pre-fills signatories from D2.11 and contract value
  from D1.15.
- **Staff does:** logs the execution date and platform, links to the
  executed PDF and audit certificate; confirms the invoice was
  generated and sent to Finance; records the invoice number/date;
  signs.
- **Client does:** nothing.
- **Unlocks:** D2.13.

> **Open item:** if signing runs through DocuSign, the executed PDF,
> audit certificate, and completion event could be pulled in
> automatically via DocuSign's API — the same pattern as D1.1's intake
> webhook — instead of a human pasting links. Not decided.

### D2.13 — Archived Contract Record

- **Why:** confirm every document from onboarding through execution is
  permanently filed.
- **App does:** provides the vault checklist.
- **Staff does:** verifies each required document (brief, baseline,
  negotiation notes, executed contract, audit certificate) is in the
  permanent vault, correctly named; signs.
- **Client does:** nothing.
- **Unlocks:** D2.14.

### D2.14 — Phase Initiation Notice

- **Why:** confirm the advance payment has actually cleared, and
  formally authorize engineering work to begin.
- **App does:** pre-fills PM, timeline, and invoice details from
  D1.16/D1.15/D2.12; on sign-off, sets the project to "Active
  Engineering Phase," marks the advance as cleared, and unlocks
  Workbook 03.
- **Staff does:** Finance confirms the date the payment actually
  cleared and signs the financial clearance; Head of Ops sets the
  official start and target delivery dates, confirms the launch
  checklist, authorizes the engineering team, and signs.
- **Client does:** nothing.
- **Unlocks:** Workbook 03 — the hard gate. Nothing here can be
  bypassed.

```
D2.2 → D2.3 → D2.4 → D2.5 → D2.6 → D2.7
  ├─ (Accepted as-is) ──────────────────────────┐
  └─ (Requested Negotiation) → D2.8 → D2.9 → D2.10 ┤
                                                  D2.11 → D2.12 → D2.13 → D2.14
                                                  → unlocks Workbook 03
```

---

## Hard stops and revision loops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D2.3  | Revisions Required | Returns to Contract Admin for edits. |
| D2.4  | Revisions Required | Returns to Contract Admin for edits. |
| D2.5  | Rejected / Hold for Revision | Project closed or held; D2.6 blocked. |
| D2.9  | Meeting outcome = Deadlock | Escalate to Head of R&D; D2.10 blocked. |
| D2.9  | Meeting outcome = Client Withdrawn | Project status set to Closed/Lost. |
| D2.10 | Overhead no longer met after pricing change | D2.11 blocked; Finance must review. |
| D2.14 | Financial clearance not complete | Workbook 03 stays locked, regardless of anything else. |
