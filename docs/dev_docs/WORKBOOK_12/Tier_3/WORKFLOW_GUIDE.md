# Workbook 12 (Training & Post-Delivery Support) — Tier 3 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`.

Unlocked once both Workbook 10 (D10.6) and Workbook 11 (D11.5) are signed off. D12.3 repeats per support incident during the warranty period; D12.4 runs once, at the end of warranty. D12.5 is the final tool in the entire IMHOGEN QMS.

---

### D12.1 — Operator Training Syllabus

- **Why:** plan what training the client's operators will get.
- **App does:** nothing auto beyond project name.
- **Staff does (Lead Trainer):** builds the module list (title, duration, delivery method, materials); signs.
- **Client does:** nothing.
- **Unlocks:** D12.2.

### D12.2 — Operator Competency Log

- **Why:** confirm operators can actually run the unit competently.
- **App does:** nothing auto.
- **Staff does (Assessor):** scores each operator per module; marks Competent / Requires Re-training; confirms all competent; signs.
- **Client does:** operators are assessed and sign to confirm their result.
- **Unlocks:** feeds the warranty support handover — blocked if any operator needs re-training.

### D12.3 — Post-Delivery Support Tracker *(repeats per incident during warranty)*

- **Why:** log and resolve support tickets raised during the warranty period.
- **App does:** nothing auto.
- **Staff does (Support Officer):** logs each issue, priority, action taken, and status; signs.
- **Client does:** raises the issue.
- **Unlocks:** feeds D12.4 — blocked from closing out warranty if any incident is still Open.

### D12.4 — Final Operational Audit Report *(once, at end of warranty)*

- **Why:** check the unit's real-world performance against the original design spec before closing warranty.
- **App does:** pre-fills the warranty end date from the project's warranty start date plus duration.
- **Staff does (Lead Engineer):** compares each KPI's target vs actual and marks Met / Not Met; signs.
- **Client does:** nothing directly.
- **Unlocks:** D12.5 — a KPI marked "Not Met" gets flagged for Head of Engineering review before D12.5 is allowed.

### D12.5 — Project Ledger Closure Record

- **Why:** the final financial close — confirms everything's been paid and formally closes the project. The last tool in the entire IMHOGEN QMS.
- **App does:** on sign-off, sets the project status to "Closed."
- **Staff does:** PM fills the financial summary (contract value, received, outstanding balance) and confirms all payments are reconciled; PM, Head of Operations, and Head of Finance all three sign.
- **Client does:** nothing.
- **Unlocks:** nothing further — the project is closed.

```
D12.1 → D12.2 → D12.3 (repeats during warranty) → D12.4 → D12.5 → project Closed
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D12.2 | Any operator requires re-training | Warranty support handover blocked. |
| D12.3 | Any incident still Open | D12.4 blocked. |
| D12.4 | Any KPI Not Met | Flagged for Head of Engineering review before D12.5. |
| D12.5 | Not all payments received/reconciled | Sign-off blocked. |
| D12.5 | Missing any of PM / Head of Ops / Head of Finance signature | Sign-off blocked — all three required. |
