# Workbook 10 (Engineering Documentation & Archiving) — Tier 3 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`.

Unlocked in parallel with Workbook 11 once D9.8 (Delivery Authorization Notice, WB09) is signed off. Workbook 12 needs both Workbook 10 and Workbook 11 complete.

---

### D10.1 — As-Built Modification Record

- **Why:** document any place the actual fabricated unit deviates from the approved CAD design.
- **App does:** nothing auto.
- **Staff does (Lead Engineer):** logs each deviation (feature, approved spec, as-built actual, reason, impact); signs.
- **Client does:** nothing.
- **Unlocks:** D10.2 — blocked if a deviation is missing its reason or impact.

### D10.2 — Technical Authoring Tracker

- **Why:** track every technical document needed for the final package through to approval.
- **App does:** nothing auto.
- **Staff does (Document Controller):** tracks each document's author, status, version, and file link; confirms all are approved; signs.
- **Client does:** nothing.
- **Unlocks:** D10.3 — blocked if any document isn't Approved.

### D10.3 — Final TDP Manifest

- **Why:** compile the complete, version-controlled list of every deliverable document.
- **App does:** nothing auto.
- **Staff does:** lists every TDP file with format, version, vault link, and status; confirms it's complete and verified; Lead Engineer signs.
- **Client does:** nothing.
- **Unlocks:** D10.4 — blocked if not marked complete.

### D10.4 — Digital Archiving & Vault Lock

- **Why:** permanently lock the project vault as the archive of record.
- **App does:** on sign-off, locks the vault (sets all files read-only) and records the vault path.
- **Staff does (Archiving Officer):** confirms the archive checklist (CAD read-only, TDP filed, as-built filed, QA certificates filed, backup created); signs.
- **Client does:** nothing.
- **Unlocks:** D10.5/D10.6 — blocked if any checklist item is still pending.

### D10.5 — R&D Lessons Learned Log

- **Why:** capture what went well or poorly for future projects.
- **App does:** nothing auto.
- **Staff does (Lead Engineer):** logs each lesson by category with root cause and recommendation; signs.
- **Client does:** nothing.
- **Unlocks:** feeds into D10.6's handover items.

### D10.6 — Delivery & Handover Notice

- **Why:** confirm the client actually received the final documentation and close this phase.
- **App does:** nothing auto beyond project name.
- **Staff does (PM):** confirms the TDP was delivered, the vault link shared, and lessons learned filed; signs.
- **Client does:** receives the final TDP and vault link.
- **Unlocks:** Workbook 12, together with Workbook 11 — requires both D10.3 and D10.4 to already be signed.

```
D10.1 → D10.2 → D10.3 → D10.4 → D10.5 → D10.6
  → (with Workbook 11) unlocks Workbook 12
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D10.1 | A deviation has no reason/impact documented | D10.2 blocked. |
| D10.2 | Any document not Approved | D10.3 blocked. |
| D10.3 | TDP not marked complete | D10.4 blocked. |
| D10.4 | Any archive checklist item pending | Sign-off blocked. |
| D10.6 | D10.3 or D10.4 not yet signed | D10.6 cannot complete. |
