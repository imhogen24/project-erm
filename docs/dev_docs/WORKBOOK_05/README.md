# Workbook 05 — Standard Engineering Design Process (ERM Focused)

## Developer Reference

**Canonical schema:** `05_standard_engineering_design_process_schema.json`
**Raw source (reference only):** `05_standard_engineering_design_process.json`
**Source spreadsheet:** `SPREADSHEET/05RDBI ERM Focused.xlsx` (25 sheets)

---

## Overview

WB05 covers the structured engineering design methodology across five sequential phases (P1–P6). This is the **ERM Focused** version — 25 sheets covering the core design phase tools. Unlike WB01–04 which are administrative workflows, WB05 is technical: engineers work through each phase producing analysis worksheets that consolidate into phase-gating master tools.

This workbook is **Tier 1 only**. Tier 3 projects skip it entirely.

---

## Gate logic

Unlocked when D4.8 (Locked Project Baseline) is signed off. Completion of D6.5.2 (Master Model Decomposition) unlocks WB06 (CAD and Design Engineering).

**High-level flow:**

```
P1.0 → P2.0 → [P3 phase] → [P4 phase] → [P5 phase] → D6.5.2
```

### Phase detail

```
P1 phase:
  → P1.0 (Master Requirements Matrix — gates P2)

P2 phase:
  Pr2.1 (Gantt)
  → P2.0 (Master Capacity & Execution Plan — gates P3)

P3 phase (Conceptual Design):
  P3.1, P3.1a, P3.1b → P3.2, P3.2a → P3.3

P4 phase (Organ Structure):
  P4.1A, P4.1B, P4.1C, P4.1D
  → P4.2A, P4.2B, P4.2C → P4.2D (gates P5)

P5 phase (Constructional Design):
  P5a.1.i, P5a.1.ii → P5.2 → P5.3 → P5.3.1 → P5.4 → P5.4.1
  → D6.5.2 (gates WB06)
```

---

## Phase group summary

| Phase group | Tools | Gate |
|---|---|---|
| P1 Master | P1.0 | Sign-off gates P2 |
| P2 Planning | Pr2.1 | Feeds into P2.0 |
| P2 Master | P2.0 | Sign-off gates P3 |
| P3 Conceptual Design | P3.1, P3.1a, P3.1b, P3.2, P3.2a, P3.3 | P3.3 gates P4 |
| P4 Organ Structure | P4.1A, P4.1B, P4.1C, P4.1D, P4.2A, P4.2B, P4.2C, P4.2D | P4.2D sign-off gates P5 |
| P5 Constructional Design | P5a.1.i, P5a.1.ii, P5.2, P5.3, P5.3.1, P5.4, P5.4.1 | P5.4.1 gates D6.5.2 |
| Handover | D6.5.2 | Sign-off unlocks WB06 |

---

## Master gating tools

The ERM tracks phase completion through three master tools.

### P1.0 — Master Requirements Matrix
- Consolidated requirements register (REQ IDs, categories, target values, verification methods)
- Lead Engineer sign-off → unlocks P2
- Contains REQ-001 through REQ-00N rows with Pr1–Pr8 category classification

### P2.0 — Master Capacity & Execution Plan
- Master execution task list (TSK IDs, assignees, complexity, duration, deliverable format)
- Inherits `total_engineering_days` and `total_labor_budget_ghs` from D4.8
- Lead Engineer sign-off → unlocks P3

### D6.5.2 — Master Model Decomposition
- Final hierarchical BOM with iProperty data for CAD (Autodesk Inventor)
- `decomposition_complete = true` + Lead Engineer + Head of Engineering sign-off:

```sql
UPDATE projects
SET status = 'WB06 Active'
WHERE project_id = current_project_id;
```

---

## Tool types and their patterns

| Type | Tools | Field pattern |
|---|---|---|
| Master requirements | P1.0 | requirements table (REQ ID, source ref, description, category, priority, target value, tolerance, verification) |
| Master execution | P2.0 | constraints block + tasks table (TSK ID, EDPM ref, description, assignee, complexity, days, dates, deliverable, status) |
| Gantt | Pr2.1 | external link + WBS task table (12-week day-by-day) |
| Transformation diagrams | P3.1, P3.1a, P3.1b | input/output operands table + transformation process diagram |
| Function structure | P3.2, P3.2a, P3.3 | function table (FID, function name, parameters, operators, evoked functions) |
| Morphological matrices | P4.1A, P4.1B, P4.1C, P4.1D | matrix table (FID/EFID, principles and organs, remarks) |
| Topology | P4.2A, P4.2B, P4.2C, P4.2D | diagram file link + notes |
| Construction requirements | P5a.1.i, P5a.1.ii | requirements table (RQN, requirement, related function group) |
| Construction design | P5.2, P5.3, P5.3.1, P5.4 | constructional groups table + diagram file link |
| Part-level definition | P5.4.1 | material, CAD file name, manufacturing notes, failure modes |
| BOM decomposition | D6.5.2 | 5-level hierarchy table with iProperty data |

---

## Auto-populated fields

- `total_engineering_days`, `total_labor_budget_ghs`, `project_start_date`, `target_handover_date` (P2.0) — from D4.8

---

## Database mapping

| Schema entity | DB table | Notes |
|---|---|---|
| All 25 tool instances | `tool_instances` | One row per `(project_id, tool_id)` |
| Phase gating state | `projects.status` | Updated at P1.0, P2.0, P4.2D, D6.5.2 sign-offs |
| BOM data | `tool_instances` (D6.5.2 JSONB) | Part hierarchy queryable by `item_id` |
| Gantt reference | `tool_instances` (Pr2.1 JSONB) | `external_gantt_link` only — Gantt lives in external tool |

P3–P5 analysis tools (diagrams, matrices, topologies) store their primary artifact as a `file_link` pointing to the engineering workspace (CAD vault / Google Drive). The ERM stores the link and sign-off state, not the artifact itself.

---

## Hard stops the UI must enforce

- P1.0 `requirements_complete = false` → block P2.0; requirements must be reviewed and signed off first
- P2.0 `all_tasks_defined = false` → block P3.1; execution plan must be signed off before conceptual design begins
- P4.2D `selection_rationale` empty → block sign-off; engineer must document why this concept was chosen
- D6.5.2 `decomposition_complete = false` → block WB06 unlock; all parts must have iProperty data
