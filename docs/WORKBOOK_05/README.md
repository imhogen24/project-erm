# Workbook 05 — Standard Engineering Design Process

## Developer Reference

**Canonical schema:** `05_standard_engineering_design_process_schema.json`
**Raw source (reference only):** `05_standard_engineering_design_process.json`

---

## Overview

WB05 is the largest workbook — 64 tools spanning a structured engineering design methodology (P1–P5). Unlike WB01–04 which are administrative workflows, WB05 is technical: engineers work through five sequential design phases, each producing analysis worksheets that consolidate into phase-gating master tools.

This workbook is **Tier 1 only**. Tier 3 projects skip it entirely.

---

## Gate logic

Unlocked when D4.8 (Locked Project Baseline) is signed off. Completion of D6.5.2 (Master Model Decomposition) unlocks WB06 (CAD and Design Engineering).

**High-level flow:**

```
D5.0 → P0.0 → [P1 phase] → [P2 phase] → [P3 phase] → [P4 phase] → [P5 phase] → D6.5.2
```

### Phase detail

```
P1 phase:
  P1.1, P1.2, P1.3, P1.4, P1.5, P1.6a, P1.6b, P1.6c, P1.7a, P1.7b, P1.8
  + Pr1, Pr1A, Pr1B, Pr1C, Pr2, Pr3, Pr4, Pr5, Pr6, Pr7, Pr8
  → P1.0 (Master Requirements Matrix — gates P2)

P2 phase:
  P2.1, P2.2, P2.3, P2.4, P2.5, P2.6, P2.7, P2.8
  + Pr2.1 (Gantt), Pr2.2a, Pr2.2b, Pr2.2c, Pr2.2d, Pr2.2e, Pr2.2f
  → P2.0 (Master Capacity & Execution Plan — gates P3)

P3 phase (Conceptual Design):
  P3.1, P3.1a, P3.1b → P3.2, P3.2a, P3.2b → P3.3

P4 phase (Organ Structure):
  P4.1, P4.1-EF, P4.1-SYN, P4.1-ESYN
  → P4.2-TOP, P4.2-ICON, P4.2-OD → P4.2-FINAL (gates P5)

P5 phase (Constructional Design):
  P5a.1i, P5a.1ii → P5.2 → P5.3 → P5.3.1 → P5.4 → P5.4.1
  → D6.5.2 (gates WB06)
```

---

## Phase group summary

| Phase group | Tools | Gate |
|---|---|---|
| Admin | D5.0, P0.0 | Must complete before P1 |
| P1 Requirements | P1.1–P1.8, Pr1–Pr8 | Consolidate into P1.0 |
| P1 Master | P1.0 | Sign-off gates P2 |
| P2 Planning | P2.1–P2.8, Pr2.1, Pr2.2a–f | Consolidate into P2.0 |
| P2 Master | P2.0 | Sign-off gates P3 |
| P3 Conceptual Design | P3.1–P3.3 (+ variants) | P3.3 gates P4 |
| P4 Organ Structure | P4.1–P4.2-FINAL | P4.2-FINAL sign-off gates P5 |
| P5 Constructional Design | P5a.1i–P5.4.1 | P5.4.1 gates D6.5.2 |
| Handover | D6.5.2 | Sign-off unlocks WB06 |

---

## Master gating tools

The ERM tracks phase completion through four master tools. Sub-worksheets must be complete before the master can be approved.

### P1.0 — Master Requirements Matrix
- Consolidates all P1.1–P1.8 and Pr1–Pr8 worksheets
- `all_p1_worksheets_complete = true` + Lead Engineer sign-off → unlocks P2
- Contains the consolidated requirements register (REQ IDs, categories, target values, verification methods)

### P2.0 — Master Capacity & Execution Plan
- Consolidates all P2.1–P2.8, Pr2.1 Gantt, and Pr2.2a–f progress sheets
- `all_p2_worksheets_complete = true` + Lead Engineer sign-off → unlocks P3
- Inherits `baseline_start`, `baseline_end`, `total_labor_budget_ghs` from D4.8

### P4.2-FINAL — Final Organ Structure
- Selected concept from morphological analysis; must include selection rationale
- Lead Engineer sign-off → unlocks P5 constructional design

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
| Requirement worksheets | P1.1–P1.8, Pr1–Pr8 | entries table (SN, priority, description, D/W) + review comments |
| EDPM planning worksheets | P2.1–P2.8 | entries table (SN, delivery output) + review comments |
| Phase progress trackers | Pr2.2a–f | tasks table (process code, assignee, status B/P/R/C, delivery tool) |
| Gantt | Pr2.1 | external link + WBS task table |
| Transformation diagrams | P3.1, P3.1a, P3.1b | input operands table + output operands table |
| Function structure | P3.2, P3.2a, P3.2b | function table (FID, function name, parameters, operators, evoked functions) |
| Morphological matrices | P4.1, P4.1-EF, P4.1-SYN, P4.1-ESYN | matrix table (FID, principles and organs) |
| Topology | P4.2-TOP, P4.2-ICON, P4.2-OD | diagram file link + notes |
| Construction requirements | P5a.1i, P5a.1ii | requirements table (group, description, P1.0 ref, D/W) |
| Construction design | P5.2, P5.3, P5.3.1, P5.4 | constructional groups table + diagram file link |
| Part-level definition | P5.4.1 | material, CAD file name, manufacturing notes, failure modes |
| BOM decomposition | D6.5.2 | 5-level hierarchy table with iProperty data |

---

## Auto-populated fields

- `project_name` (D5.0 s1) — from D1.3
- `total_engineering_days`, `total_labor_budget_ghs`, `project_start_date`, `target_handover_date` (P2.0 s1) — from D4.8
- `P2.0 task constraints` — inherited from D4.8 `baseline_start` / `baseline_end`

---

## Database mapping

| Schema entity | DB table | Notes |
|---|---|---|
| All 64 tool instances | `tool_instances` | One row per `(project_id, tool_id)` |
| Phase gating state | `projects.status` | Updated at P1.0, P2.0, P4.2-FINAL, D6.5.2 sign-offs |
| BOM data | `tool_instances` (D6.5.2 JSONB) | Part hierarchy queryable by `item_id` |
| Gantt reference | `tool_instances` (Pr2.1 JSONB) | `external_gantt_link` only — Gantt lives in external tool |

P3–P5 analysis tools (diagrams, matrices, topologies) store their primary artifact as a `file_link` pointing to the engineering workspace (CAD vault / Google Drive). The ERM stores the link and sign-off state, not the artifact itself.

---

## Hard stops the UI must enforce

- D5.0 `source_documents` any row `status = "Rejected"` → block P0.0; upstream document must be re-approved
- P0.0 `all_sources_confirmed = false` → block P1.1 (no engineering analysis without confirmed inputs)
- P1.0 `all_p1_worksheets_complete = false` → block P2.1; all P1 and Pr worksheets must be reviewed first
- P2.0 `all_p2_worksheets_complete = false` → block P3.1; all P2 and Pr2 worksheets must be reviewed first
- P4.2-FINAL `selection_rationale` empty → block sign-off; engineer must document why this concept was chosen
- D6.5.2 `decomposition_complete = false` → block WB06 unlock; all parts must have iProperty data

---

## Skipped artifacts

- `A1. ED Process` — methodology flow diagram (process reference map only, no form fields)
