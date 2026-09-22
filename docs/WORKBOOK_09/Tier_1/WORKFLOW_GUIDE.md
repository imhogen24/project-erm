# Workbook 09 (Quality Control & Testing) — Tier 1 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`.

Unlocked once D8.6 (Fabrication Completion Notice, WB08) is signed off. D9.5 and D9.6 only run if an inspection fails.

---

### D9.1 — QA Testing Checklist (Prep)

- **Why:** confirm the unit and test setup are actually ready before testing starts.
- **App does:** nothing auto beyond project name.
- **Staff does (QA Officer):** checks equipment calibration, drawing version match, unit serial number, that D8.5 rework is closed, and the safety area; confirms cleared for testing; signs.
- **Client does:** nothing.
- **Unlocks:** D9.2 — blocked if any prep check fails.

### D9.2 — Visual Inspection Log

- **Why:** check for visible defects.
- **App does:** nothing auto.
- **Staff does:** logs each inspection area, any defect observed, pass/fail, and a photo reference; confirms all passed; signs.
- **Client does:** nothing.
- **Unlocks:** continues toward D9.7 if it passes; any fail requires D9.5.

### D9.3 — Dimensional Audit Report

- **Why:** measure critical dimensions against tolerance.
- **App does:** nothing auto.
- **Staff does:** measures each feature (nominal vs actual vs tolerance) and marks pass/fail; confirms everything's within tolerance; signs.
- **Client does:** nothing.
- **Unlocks:** continues toward D9.7 if it passes; any fail requires D9.5.

### D9.4 — Load & Function Test Report

- **Why:** confirm the unit actually works under load/function conditions.
- **App does:** pre-fills project name.
- **Staff does (Test Engineer):** runs each test against its spec, records the result and pass/fail; confirms all tests passed; signs.
- **Client does:** nothing.
- **Unlocks:** all pass → D9.7. Any fail → D9.5.

### D9.5 — Non-Conformance Report *(only if D9.2/D9.3/D9.4 fails)*

- **Why:** formally document a failed check and decide what to do about it.
- **App does:** generates the NCR number.
- **Staff does:** describes the defect, severity, and source. Head of Engineering decides disposition — Rework / Accept as-is with waiver / Scrap; signs.
- **Client does:** nothing.
- **Unlocks:** "Rework" → D9.6. "Accept with waiver" or "Scrap" → feeds directly into D9.7's summary.

### D9.6 — Rework Action Order *(only if D9.5 disposition = Rework)*

- **Why:** authorize and track the actual fix.
- **App does:** nothing auto.
- **Staff does:** lists rework tasks with assignee and deadline. Supervisor confirms rework is complete and ready for re-inspection; signs.
- **Client does:** nothing.
- **Unlocks:** loops back to re-run the relevant inspection tool (D9.2, D9.3, or D9.4).

---

### D9.7 — Final QA Release Certificate

- **Why:** formally release the unit from QA hold once everything passes (or is waived with justification).
- **App does:** nothing auto beyond project name.
- **Staff does (QA Manager):** summarizes the outcome of each of the three inspection tools (Pass/Waived); confirms all QA is complete. Head of Engineering signs.
- **Client does:** nothing.
- **Unlocks:** D9.8 — blocked if not all QA is complete or waived with documented justification.

### D9.8 — Delivery Authorization Notice

- **Why:** PM and Head of Ops jointly authorize the unit for delivery.
- **App does:** on sign-off, sets the project to "Delivery Phase," unlocking Workbooks 10 and 11 in parallel.
- **Staff does:** confirms the QA certificate reference, delivery schedule, transport logistics, and final invoice are ready. PM and Head of Operations both sign.
- **Client does:** nothing.
- **Unlocks:** Workbook 10 and Workbook 11, in parallel — blocked if D9.7 hasn't been signed yet.

```
D9.1 → D9.2 → D9.3 → D9.4
  (any fail) → D9.5 → D9.6 (if rework) → re-inspect D9.2/D9.3/D9.4
  (all pass / waived) → D9.7 → D9.8 → unlocks Workbook 10 + Workbook 11
```

---

## Hard stops

| Step | Condition | Effect |
|------|-----------|--------|
| D9.1 | Any prep check fails | D9.2 blocked. |
| D9.2/D9.3/D9.4 | Any check fails | D9.5 (NCR) must be raised before D9.7. |
| D9.5 | Disposition = Rework | D9.6 must be issued and completed before re-inspection. |
| D9.7 | Not all QA complete | D9.8 blocked. |
| D9.8 | D9.7 not yet signed | Sign-off blocked. |
