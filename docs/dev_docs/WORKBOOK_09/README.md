# Workbook 09 — Quality Control and Testing Process

## Developer Reference

**Canonical schema:** `09_quality_control_schema.json`
**Raw source (reference only):** `09_quality_control_and_testing_process.json`

---

## Gate logic

Unlocked when D8.6 (Fabrication Completion Notice, WB08) is signed off. D9.8 (Delivery Authorization Notice) sign-off sets `projects.status = 'Delivery Phase'` and unlocks WB10 and WB11 in parallel.

```
D9.1 → D9.2 → D9.3 → D9.4
                         ↓ (if any Fail)       ↓ (all Pass)
                       D9.5 → D9.6          D9.7 → D9.8
                         ↓ (rework done)
                     re-inspect D9.2/D9.3/D9.4
```

---

## Conditional tools

**D9.5 (Non-Conformance Report)** and **D9.6 (Rework Action Order)** are conditional — only raised when D9.2, D9.3, or D9.4 returns a Fail result. The gate engine must check all inspection outcomes before allowing D9.7.

After rework (D9.6 complete), the relevant inspection tool (D9.2/D9.3/D9.4) must be re-run. The cycle can repeat until all checks pass or a waiver is formally documented in D9.7.

---

## DB writes at key tool completions

**D9.8 — Delivery Authorization Notice**

```sql
UPDATE projects
SET status = 'Delivery Phase',
    qa_release_date = D9.7.date_signed
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_name` — from D1.3 across all tools

## Auto-generated fields

- `ncr_number` (D9.5) — system-generated, format `NCR-YY-NNN`

---

## Hard stops the UI must enforce

- D9.1 any prep check `status = "Fail"` → block D9.2; unit not cleared for testing
- D9.2/D9.3/D9.4 any `status = "Fail"` → D9.5 NCR must be raised before D9.7
- D9.5 `disposition = "Rework"` → D9.6 must be issued and completed before re-inspection
- D9.7 `all_qa_complete = false` → block D9.8 and delivery unlock
- D9.8 requires D9.7 reference filled → block sign-off if D9.7 not yet signed

---

## Skipped artifacts

- `D9-Index` — navigation index only
- `D9 Master QA Database` — pipeline dashboard; rendered from `tool_instances` query
