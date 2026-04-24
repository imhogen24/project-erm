# Workbook 08 — Fabrication and Construction Process

## Developer Reference

**Canonical schema:** `08_fabrication_and_construction_process_schema.json`
**Raw source (reference only):** `08_fabrication_and_construction_process.json`

---

## Gate logic

Unlocked when D7.7 (Updated Inventory Ledger, WB07) is signed off. D8.6 (Fabrication Completion Notice) sign-off sets `projects.status = 'Testing Phase'` and unlocks WB09.

**Sequential path:**
```
D8.2 → D8.3 → D8.1   (pre-shift, per day — D8.2 and D8.3 must pass before D8.1 is issued)
                 ↓
              D8.4 (per batch/assembly, runs in parallel across batches)
                 ↓
              D8.5 (per inspection stage on each D8.4 batch)
                 ↓
              D8.6 (once all batches complete)
```

---

## Repeating tools

All tools except D8.6 repeat throughout the fabrication phase:

| Tool | Repeat unit | Blocking condition |
|---|---|---|
| D8.2 | Per shift | Any `status = "Fail"` blocks shift start |
| D8.3 | Per shift | Any unsigned technician blocks work start |
| D8.1 | Per shift | Requires D8.2 and D8.3 complete for same shift |
| D8.4 | Per batch / assembly | Each stage must be signed before next stage begins |
| D8.5 | Per inspection stage | `status = "FAIL"` or `status = "REWORK"` blocks next fab stage |

In the DB, repeating instances use `(project_id, tool_id, shift_date)` for daily tools and `(project_id, tool_id, batch_id)` for batch tools.

---

## DB writes at key tool completions

**D8.6 — Fabrication Completion Notice**

```sql
UPDATE projects
SET status = 'Testing Phase',
    fabrication_complete_date = D8.6.date_signed
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_name` — from D1.3 across all tools

---

## Hard stops the UI must enforce

- D8.2 any `status = "Fail"` without `corrective_action` filled → block D8.1 for that shift
- D8.3 any technician `understood_risk = "No"` or unsigned → block D8.1; all personnel must be briefed
- D8.4 stage N sign-off missing → block stage N+1; routing stages are strictly sequential
- D8.5 any `status = "FAIL"` or `status = "REWORK"` → block D8.4 traveler completion for that batch; rework must be done and re-inspected
- D8.6 `fabrication_complete = false` → block sign-off and WB09 unlock
- D8.6 any outstanding D8.5 `rework_required = true` → block D8.6; all rework must be closed first

---

## Skipped artifacts

- `D8-Index` — navigation index only
- `D8 Master` (empty sheet) — pipeline dashboard; rendered from `tool_instances` query
