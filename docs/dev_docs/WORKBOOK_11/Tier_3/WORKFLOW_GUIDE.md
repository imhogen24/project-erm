# Workbook 11 (Product / Process Delivery) — Tier 3 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`.

Unlocked in parallel with Workbook 10 once D9.8 (Delivery Authorization Notice, WB09) is signed off.

---

### D11.1 — Transport Waybill

- **Why:** log the unit leaving the facility — vehicle, driver, route, and cargo condition.
- **App does:** nothing auto beyond project name.
- **Staff does (Dispatch Supervisor):** fills vehicle/driver details; lists cargo with condition at dispatch; signs.
- **Client does:** nothing.
- **Unlocks:** D11.2.

### D11.2 — Post-Transit Inspection Log

- **Why:** check the unit arrived intact after transport.
- **App does:** pre-fills the waybill reference from D11.1.
- **Staff does (Receiving Officer):** inspects each item's condition — Good / Damaged / Missing; confirms everything's intact; signs.
- **Client does:** nothing.
- **Unlocks:** D11.3 — blocked if any item is damaged, until resolved (vendor claim or replacement).

### D11.3 — Site Acceptance & Training Record

- **Why:** get the unit formally accepted on-site and train the client's operators.
- **App does:** nothing auto.
- **Staff does (Lead Engineer):** runs the site acceptance checks; logs each operator trained with topics covered; signs.
- **Client does:** site contact confirms acceptance of the unit; operators attend training and sign.
- **Unlocks:** D11.4 — blocked if any site check fails or an operator needs re-training.

### D11.4 — Final Handover Certificate

- **Why:** the formal joint certificate that the project is complete — this starts the warranty clock.
- **App does:** on signature, marks the project handed over and sets the warranty start date.
- **Staff does (PM):** signs.
- **Client does:** confirms full acceptance of all deliverables and signs.
- **Unlocks:** D11.5 — blocked if the client hasn't confirmed satisfaction.

### D11.5 — Final Billing Authorization

- **Why:** authorize release of the final invoice.
- **App does:** on sign-off, records the final invoice as authorized and unlocks Workbook 12.
- **Staff does (PM + Head of Ops):** references the handover certificate; sets the final invoice value; confirms it's authorized; both sign.
- **Client does:** nothing here — receives the invoice afterward.
- **Unlocks:** Workbook 12 — blocked if not authorized.

```
D11.1 → D11.2 → D11.3 → D11.4 → D11.5 → unlocks Workbook 12
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D11.2 | Any item damaged in transit | D11.3 blocked until resolved. |
| D11.3 | Any site check fails, or an operator needs re-training | D11.4 blocked. |
| D11.4 | Client not satisfied | D11.5 blocked. |
| D11.5 | Not authorized | Workbook 12 unlock blocked. |
