# Workbook 06 (Client Review & Approval) — Tier 3 Workflow Guide

Unlocked once D6.5.2 (Master Model Decomposition, WB05) is signed off. D6.1–D6.9 repeat once per revision round (round 1 = initial TDP delivery; round 2+ = client requests changes). T3.D6.10a client acceptance breaks the cycle. Only the CAD-execution steps and the acceptance step differ from Tier 1 — everything else is identical.

---

### T3.D6.5.0a — T3 Reverse Engineering Validation

- **Why:** check the CAD model actually matches the physical part before drafting starts.
- **App does:** nothing auto.
- **Staff does (Lead Engineer):** measures critical features physically vs in CAD; logs variance and pass/fail per feature; confirms all within tolerance; signs.
- **Client does:** nothing.
- **Unlocks:** T3.D6.5.1a — blocked if any feature fails tolerance.

### T3.D6.5.1a — T3 3D Modeling Execution

- **Why:** track reconstruction of each component from source data into a validated CAD model.
- **App does:** nothing auto.
- **Staff does (Lead Engineer):** chooses source data type and modeling software; logs each component's reconstruction status and validation against the field log (T3.D1.8a); notes design-intent decisions; links the CAD master file; confirms everything reconstructed and validated; signs.
- **Client does:** nothing.
- **Unlocks:** D6.5.4.

### D6.5.4 — QA & Drawing Review Log

- **Why:** catch drawing errors internally before the client ever sees them.
- **App does:** nothing auto.
- **Staff does:** logs each drawing/focus-area check as Pass/Fail with notes and required fixes; tracks each issue to Closed; Head of Engineering confirms everything's resolved and signs.
- **Client does:** nothing.
- **Unlocks:** D6.1 — blocked if any issue is still open.

---

## The review cycle (repeats per revision round)

### D6.1 — Client Delivery Transmittal

- **Why:** formally send the Technical Data Package (TDP) to the client and start the review clock.
- **App does:** nothing auto beyond client name.
- **Staff does (PM):** lists every file in the package with format, secure link, and QA-verified flag; signs and dispatches.
- **Client does:** receives the TDP.
- **Unlocks:** D6.2.

### D6.2 — Presentation Meeting Invite & Agenda

- **Why:** schedule the design walkthrough with the client.
- **App does:** nothing auto.
- **Staff does (PM):** sets meeting details; sends the invite (script provided); confirms it was sent; signs.
- **Client does:** confirms attendance.
- **Unlocks:** D6.3.

### D6.3 — Presentation Meeting Minutes

- **Why:** capture the client's live reaction to the design.
- **App does:** nothing auto.
- **Staff does (PM/note-taker):** logs each comment/question and IMHOGEN's live response; records the client's overall initial reaction; signs.
- **Client does:** attends, reacts, asks questions.
- **Unlocks:** "Accepted as-is" or "revisions requested" → D6.4. "Rejected" → escalate to Head of Ops; PM decides before proceeding.

### D6.4 — Client Feedback Form

- **Why:** get the client's revision requests in a formal, signed, structured form — not just meeting notes.
- **App does:** nothing auto beyond project name.
- **Staff does (PM):** dispatches and tracks the form.
- **Client does:** fills in each specific change requested, with reason and priority; signs. This one is genuinely client-authored.
- **Unlocks:** D6.5.

### D6.5 — Master Revision Log

- **Why:** PM's internal tracker consolidating every revision request from both the meeting (D6.3) and the formal feedback form (D6.4).
- **App does:** nothing auto.
- **Staff does (PM):** logs each revision with its source; classifies status (Pending / Approved / Rejected / Aborted); signs.
- **Client does:** nothing.
- **Unlocks:** D6.6.

### D6.6 — Scope Assessment Report

- **Why:** decide whether each requested change is inside the original contract or needs a change order.
- **App does:** pre-fills the contract link from D2.12.
- **Staff does (PM):** checks each revision against scope; estimates engineering hours and fabrication cost impact; sets the final directive (Execute / Change Order Required / Reject); signs.
- **Client does:** nothing.
- **Unlocks:** D6.7 — blocked if any directive is "Change Order Required" until that's processed through Workbook 02.

### D6.7 — Engineering Revision Tickets

- **Why:** issue actual CAD work orders for the approved revisions.
- **App does:** nothing auto.
- **Staff does (PM):** writes each ticket (assigned engineer, CAD tool, task, hours); tracks status to Done; signs.
- **Client does:** nothing.
- **Unlocks:** D6.8.

### D6.8 — Revised Technical Data Package

- **Why:** compile the updated TDP with proper version control.
- **App does:** nothing auto.
- **Staff does (PM):** lists every revised file with format, vault link, and version number; signs.
- **Client does:** nothing.
- **Unlocks:** D6.9.

### D6.9 — Revision QA Sign-off

- **Why:** internal QA on the revised TDP before it goes back to the client.
- **App does:** nothing auto.
- **Staff does (Head of Engineering):** checks the revised files against what D6.7 asked for; confirms old QA failures are resolved, BOM updated, version numbers correct; signs.
- **Client does:** nothing.
- **Unlocks:** loops back to D6.1 for re-dispatch — blocked if any check fails.

---

### T3.D6.10a — T3 Drafting Approval & Delivery

- **Why:** the client's final acceptance for a drafting job, plus releasing the actual deliverable files.
- **App does:** nothing auto.
- **Staff does (PM):** completes the asset-release checklist (production drawings, 3D model if paid, DXF/DWG export, BOM export) with storage links; signs.
- **Client does:** accepts the TDP version and signs.
- **Unlocks:** D6.11.

### D6.11 — Project Phase Closure Notice

- **Why:** confirm every CAD-lock housekeeping task is done and formally close this phase.
- **App does:** on sign-off, sets the project to "Fabrication Phase."
- **Staff does (PM + Head of Ops):** completes the closure checklist (CAD files locked read-only, final BOM exported for Procurement, files backed up, T3.D6.10a filed); both sign.
- **Client does:** nothing.
- **Unlocks:** Workbook 07/08 (Fabrication) — blocked until all closure items are done.

```
T3.D6.5.0a → T3.D6.5.1a → D6.5.4
  → [ D6.1 → D6.2 → D6.3 → D6.4 → D6.5 → D6.6 → D6.7 → D6.8 → D6.9 ] × per revision round
  → T3.D6.10a → D6.11 → unlocks Workbook 07/08
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| T3.D6.5.0a | Any critical feature fails tolerance | T3.D6.5.1a blocked. |
| D6.5.4 | Any QA fail still open | D6.1 blocked. |
| D6.3  | Client reaction = Rejected | Escalate to Head of Ops; PM must decide before D6.4. |
| D6.6  | Any directive = Change Order Required | D6.7 blocked until processed via Workbook 02. |
| D6.9  | Any verification point fails | Re-dispatch of D6.8 blocked. |
| T3.D6.10a | Client hasn't accepted | D6.11 blocked. |
| D6.11 | Not all closure items done | Sign-off blocked. |
