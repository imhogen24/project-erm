# Workbook 08 (Fabrication & Construction) — Tier 3 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`.

Unlocked once D7.7 (Updated Inventory Ledger, WB07) is signed off. D8.2, D8.3, and D8.1 repeat every shift; D8.4 repeats per batch/assembly (running in parallel across batches); D8.5 repeats per inspection stage on each batch.

---

### D8.2 — Tooling & Setup Checklist *(per shift)*

- **Why:** verify equipment is safe and ready before any work starts.
- **App does:** nothing auto.
- **Staff does:** supervisor checks welding stations, cutting equipment, measuring instruments, lifting gear, and the work area; logs pass/fail and any corrective action; confirms the floor is clear; signs.
- **Client does:** nothing.
- **Unlocks:** feeds D8.1 — any fail without a corrective action blocks the shift from starting.

### D8.3 — Safety Briefing & PPE Log *(per shift)*

- **Why:** confirm every technician is briefed and properly equipped before work starts.
- **App does:** nothing auto.
- **Staff does:** lead supervisor/HSE runs the briefing; each technician confirms understanding and signs; supervisor confirms everyone's briefed.
- **Client does:** nothing.
- **Unlocks:** feeds D8.1 — any technician unsigned or not confirming understanding blocks work start.

### D8.1 — Job Process Sheet *(per shift, after D8.2 and D8.3 pass)*

- **Why:** allocate the day's tasks across the fabrication team.
- **App does:** nothing auto beyond project name.
- **Staff does:** supervisor sets the shift's target output; assigns tasks (drawing reference, technician, machinery, hours); tracks status through the shift; logs the end-of-shift outcome and any carryover; signs.
- **Client does:** nothing.
- **Unlocks:** the shift's fabrication work, which feeds into D8.4 batches.

### D8.4 — Fabrication Routing Traveler *(per batch/assembly)*

- **Why:** physically track a batch or assembly through each manufacturing stage, in sequence.
- **App does:** nothing auto.
- **Staff does:** issues the traveler for a batch; each stage is signed off by whoever completes it, strictly in sequence; supervisor confirms all stages complete; signs.
- **Client does:** nothing.
- **Unlocks:** feeds D8.5 at each inspection point — a missing stage sign-off blocks the next stage.

### D8.5 — In-Process QC Log *(per inspection stage per batch)*

- **Why:** check dimensional/structural quality at defined inspection points (e.g. post-welding, pre-paint).
- **App does:** nothing auto.
- **Staff does (QA Officer):** measures each parameter against tolerance; marks PASS / FAIL / REWORK; flags rework needed; signs.
- **Client does:** nothing.
- **Unlocks:** continuation of that batch's D8.4 traveler — any FAIL/REWORK blocks the next fabrication stage until it's resolved and re-inspected.

---

### D8.6 — Fabrication Completion Notice

- **Why:** confirm the whole unit is fabricated, QC'd, and ready to move to testing.
- **App does:** on sign-off, sets the project to "Testing Phase."
- **Staff does:** shop floor supervisor confirms all travelers are signed off, all QC logs passed with no open rework, the unit is visually inspected, the area is cleaned, and photos are filed; supervisor and PM both sign.
- **Client does:** nothing.
- **Unlocks:** Workbook 09 (Testing) — blocked if fabrication isn't complete or any rework is still outstanding.

```
[ D8.2 → D8.3 → D8.1 ] × per shift
  → D8.4 × per batch (parallel) → D8.5 × per inspection stage
  → D8.6 → unlocks Workbook 09
```

---

## Hard stops

| Step | Condition | Effect |
|------|-----------|--------|
| D8.2 | Fail without a corrective action | D8.1 blocked for that shift. |
| D8.3 | Technician unsigned or didn't confirm understanding | D8.1 blocked. |
| D8.4 | A stage's sign-off is missing | The next stage is blocked. |
| D8.5 | Result is FAIL or REWORK | That batch's D8.4 completion is blocked until resolved. |
| D8.6 | Fabrication not marked complete | Sign-off / Workbook 09 unlock blocked. |
| D8.6 | Outstanding rework from D8.5 | Sign-off blocked until closed. |
