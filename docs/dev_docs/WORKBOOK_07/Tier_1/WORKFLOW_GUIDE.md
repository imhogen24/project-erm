# Workbook 07 (Procurement) — Tier 1 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`.

Unlocked once D6.11 (Project Phase Closure Notice, WB06) is signed off. D7.3–D7.6 repeat per procurement category/vendor and can run in parallel.

---

### D7.1 — Final CAD BOM

- **Why:** extract the definitive parts list straight from the locked CAD model — the source of truth for everything procurement does next.
- **App does:** nothing auto beyond client name.
- **Staff does (Lead CAD Engineer):** extracts raw materials and bought-out components with specs/quantities/source type (Buy/Make/Stock); confirms it matches the locked CAD exactly; signs.
- **Client does:** nothing.
- **Unlocks:** D7.2.

### D7.2 — Procurement List & Budget Allocation

- **Why:** group the BOM into procurement categories and check the total cost fits the budget.
- **App does:** pre-fills the allocated BOM budget from D4.8.
- **Staff does (Procurement Officer):** categorizes items, allocates budget per category, sets sourcing strategy, flags lead-time risks. Head of Operations confirms it's within budget; signs.
- **Client does:** nothing.
- **Unlocks:** D7.3 — blocked if over budget, until Head of Ops approves the overrun.

---

## Per-category procurement cycle

### D7.3 — Request for Quotation (RFQ) *(repeats per vendor/category)*

- **Why:** formally solicit quotes from vendors for a procurement category.
- **App does:** generates the RFQ number.
- **Staff does:** fills vendor contact info, items requested, and commercial terms; dispatches it.
- **Client does:** nothing.
- **Unlocks:** feeds D7.4 — at least 3 RFQ instances are needed per category for items over GHS 5,000.

### D7.4 — Vendor Selection Matrix *(repeats per category)*

- **Why:** compare quotes side by side and pick a vendor.
- **App does:** nothing auto.
- **Staff does (Procurement Officer):** fills the 3-vendor comparison (price, lead time, quality, terms); picks the approved vendor with a rationale. Head of Operations signs.
- **Client does:** nothing.
- **Unlocks:** D7.5 — blocked if fewer than 3 quotes exist for an item over GHS 5,000.

### D7.5 — Approved Purchase Order *(repeats per vendor)*

- **Why:** issue the actual, legally binding order.
- **App does:** generates the PO number; pre-fills the vendor name from D7.4.
- **Staff does:** fills line items and totals, payment/warranty terms; Head of Operations signs.
- **Client does:** nothing.
- **Unlocks:** D7.6 — blocked if the PO total exceeds what D7.4 approved.

### D7.6 — Incoming Inspection Report *(repeats per delivery)*

- **Why:** check what actually arrived against what was ordered.
- **App does:** pre-fills the PO reference from D7.5.
- **Staff does (QA Officer):** inspects each item — quantity, condition, spec match — and marks Accepted / Rejected / Pending; logs any shortfalls; signs.
- **Client does:** nothing.
- **Unlocks:** feeds D7.7 — blocked if any rejection has an unresolved shortfall; a received quantity below what was ordered on a critical item flags for PM review.

---

### D7.7 — Updated Inventory Ledger

- **Why:** formally stage all received, accepted goods as project stock ready for the shop floor.
- **App does:** on sign-off, sets the project to "Fabrication Phase."
- **Staff does (Inventory Officer):** allocates each accepted item to a bin/location with status (Ready for Fabrication / Awaiting Delivery / Partially Received); confirms all critical BOM items are staged. Head of Operations signs.
- **Client does:** nothing.
- **Unlocks:** Workbook 08 (Fabrication) — blocked until all BOM items are staged.

```
D7.1 → D7.2 → [ D7.3 → D7.4 → D7.5 → D7.6 ] × per procurement category (parallel)
  → D7.7 → unlocks Workbook 08
```

---

## Hard stops

| Step | Condition | Effect |
|------|-----------|--------|
| D7.2 | Total spend over allocated budget | D7.3 blocked until Head of Ops approves the overrun. |
| D7.4 | Fewer than 3 quotes for an item > GHS 5,000 | Sign-off blocked. |
| D7.5 | PO total exceeds D7.4's approved value | Sign-off blocked. |
| D7.6 | Rejected item with an unresolved shortfall | D7.7 blocked. |
| D7.6 | Received quantity < ordered on a critical item | Flagged for PM review. |
| D7.7 | Not all BOM items staged | Sign-off / Workbook 08 unlock blocked. |
