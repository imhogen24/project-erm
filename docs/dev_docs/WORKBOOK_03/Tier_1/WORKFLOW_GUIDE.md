# Workbook 03 (Payment Scheduling & Fund Management) — Tier 1 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`, no Tier 3 variant exists.

Unlocked once D2.14's advance payment clears. D3.1 and D3.2 are set up once per project; D3.3–D3.10 repeat once per payment milestone (typically 3 cycles: Advance, Fabrication, Final Handover); D3.11 only runs if a payment goes overdue.

---

### D3.1 — Payment Terms Extract *(once per project)*

- **Why:** extract the agreed payment schedule from the executed contract as Finance's baseline — every invoice must match these terms.
- **App does:** pre-fills the contract link and total value from D2.12.
- **Staff does (Finance):** extracts the milestone schedule and compliance rules (payment window, late penalty, tax, currency) from the contract; confirms and signs.
- **Client does:** nothing.
- **Unlocks:** D3.2.

### D3.2 — Systems Payment Record *(once per project, updated throughout)*

- **Why:** one live ledger tracking expected vs actual payment across every milestone.
- **App does:** pre-fills expected amounts from D3.1; this record is meant to update as each milestone cycle below completes.
- **Staff does:** keeps trigger/invoice/clearance dates, variance status, and the overall financial-health summary current per milestone.
- **Client does:** nothing.
- **Unlocks:** nothing directly — it's a living record, not a gate.

---

## The milestone cycle (repeats per payment milestone)

### D3.3 — Milestone Billing Trigger

- **Why:** PM tells Finance a milestone is done and it's time to invoice.
- **App does:** pre-fills the milestone's contractual value from D3.1.
- **Staff does (PM):** confirms the milestone achieved, links proof of completion, confirms the client formally accepted it and no disputes remain; signs. Finance logs receipt and decides whether to proceed.
- **Client does:** accepts the milestone deliverable (recorded by the PM here).
- **Unlocks:** "Proceed" → D3.4. Blocked if the client hasn't accepted or disputes are open; rejected → back to PM.

### D3.4 — Draft Invoice

- **Why:** generate the actual invoice for the milestone.
- **App does:** pre-fills client billing details from D1.3 and the late-penalty term from D3.1.
- **Staff does (Finance):** builds the line items and total; confirms bank details and payment due date; signs.
- **Client does:** nothing.
- **Unlocks:** D3.5.

### D3.5 — Approved Invoice

- **Why:** Head of Finance locks the invoice before it reaches the client.
- **App does:** provides the QC checklist and PDF-lock checklist.
- **Staff does (Head of Finance):** checks the invoice against D3.1 (amount, VAT, bank details, payment window); locks it as a PDF; signs.
- **Client does:** nothing.
- **Unlocks:** any QC item failing blocks D3.6 — back to Finance. Otherwise → D3.6.

### D3.6 — Transmitted Invoice Record

- **Why:** send the locked invoice to the client and start the 21-day payment clock.
- **App does:** pre-fills the client billing email and filename from D3.5.
- **Staff does:** personalizes and sends the invoice (script provided); confirms the payment clock started and a 7-day reminder is scheduled.
- **Client does:** receives the invoice.
- **Unlocks:** D3.7.

> **Open item:** whether the 21-day payment clock and 7-day reminder are tracked/fired by the app automatically — it already knows the send date — or checked manually. Same open question as D2.11.

### D3.7 — Daily Bank Statement Log

- **Why:** check whether the client's payment has actually landed.
- **App does:** provides the log form.
- **Staff does:** checks the bank account daily; records whether funds arrived, the amount, reference, and value date; checks it matches what's expected; decides the routing action.
- **Client does:** makes the bank transfer.
- **Unlocks:** "Funds arrived" → D3.8. "No funds" → keep monitoring. "Partial payment" → escalate to Head of Finance.

> **Open item:** this is a manual daily bank check. If Fidelity Bank offers a statement/transaction feed or API, this could be automated instead of a person checking every day. Not decided.

### D3.8 — Reconciled Payment Log

- **Why:** formally match the bank deposit to the invoice and update the ledger.
- **App does:** pre-fills the expected amount from D3.5 and the actual amount/clearance date from D3.7.
- **Staff does:** confirms the funds are fully accounted for; updates the accounting system (invoice marked PAID, revenue logged); signs.
- **Client does:** nothing.
- **Unlocks:** D3.9 — blocked if funds aren't fully accounted for; Head of Finance must intervene.

### D3.9 — Payment Receipt

- **Why:** send the client official confirmation their payment was received.
- **App does:** pre-fills who paid, which invoice, and the amount from D1.3/D3.4/D3.8.
- **Staff does:** selects the payment method; generates the receipt PDF; sends it (script provided).
- **Client does:** receives the receipt.
- **Unlocks:** D3.10.

### D3.10 — Phase Unblock Notice

- **Why:** formally tell Engineering the next phase is financially cleared to start.
- **App does:** pre-fills PM from D1.16, invoice/amount from D3.4/D3.8; on sign-off, marks this milestone Cleared in D3.2 and unblocks the next engineering phase.
- **Staff does (Head of Finance):** confirms no financial holds remain; states which phase is authorized and its budget; completes the routing checklist; authorizes the engineering team; signs.
- **Client does:** nothing.
- **Unlocks:** the next engineering phase — blocked if financial holds remain.

---

### D3.11 — Overdue Accounts Report *(only if a payment goes 21+ days without clearing)*

- **Why:** escalate collection on an overdue account, and halt engineering work if needed.
- **App does:** pre-fills invoice, due date, outstanding balance, and PM from D3.4/D3.6/D3.5/D1.16.
- **Staff does:** works the escalation log (reminder → formal warning → phone call → work-stoppage notice) as it happens; calculates the penalty and reissues the invoice if needed; decides whether to escalate to Head of Ops and/or halt work; signs.
- **Client does:** nothing — is the subject of the escalation.
- **Unlocks:** runs parallel to D3.7 until resolved. If work is halted, all active engineering tools for the phase lock immediately.

```
D3.1 → D3.2 (once)
  → [ D3.3 → D3.4 → D3.5 → D3.6 → D3.7 → D3.8 → D3.9 → D3.10 ] × per milestone
        (D3.7, 21+ days overdue) → D3.11 (parallel, conditional)
  → last D3.10 unlocks next workbook
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D3.3  | Client hasn't accepted the milestone, or disputes are open | D3.4 blocked. |
| D3.5  | Any QC checklist item fails | D3.6 blocked; back to Finance. |
| D3.8  | Funds not fully accounted for | D3.9/D3.10 blocked; Head of Finance intervenes. |
| D3.10 | Financial holds remaining | Next engineering phase stays locked. |
| D3.11 | PM notified to halt work | All active engineering tools for the phase lock. |
