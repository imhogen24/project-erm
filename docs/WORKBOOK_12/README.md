# Workbook 12 — Training and Post-Delivery Support Process

## Developer Reference

**Canonical schema:** `12_training_post_delivery_schema.json`
**Raw source (reference only):** `12_training_and_post_delivery_support_process.json`

---

## Gate logic

Unlocked when both WB10 (D10.6) and WB11 (D11.5) are signed off. D12.5 (Project Ledger Closure Record) sign-off sets `projects.status = 'Closed'` — this is the final tool in the entire IMHOGEN QMS.

```
D12.1 → D12.2 → D12.3 (repeating, per incident) → D12.4 → D12.5
```

---

## Repeating tools

**D12.3 (Post-Delivery Support Tracker)** repeats per support incident raised during the warranty period. Instances use `(project_id, tool_id, incident_index)` as the composite key.

D12.4 is run once at end of warranty period (date set from `projects.warranty_start_date + warranty_duration`).

---

## DB writes at key tool completions

**D12.5 — Project Ledger Closure Record**

```sql
UPDATE projects
SET status = 'Closed',
    closed_date = D12.5.closure_date,
    all_payments_received = D12.5.all_payments_received
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_name` — from D1.3 across all tools
- `warranty_end_date` (D12.4 s1) — from `projects.warranty_start_date + warranty_duration_days`

---

## Hard stops the UI must enforce

- D12.2 any operator `status = "Requires Re-training"` → block D12.3 closure; operators must complete re-training before warranty support is handed over
- D12.3 any incident `status = "Open"` → block D12.4; all warranty support tickets must be resolved before end-of-warranty audit
- D12.4 any KPI `status = "Not Met"` → flag for Head of Engineering review before D12.5 is allowed
- D12.5 `all_payments_received = false` → block sign-off; outstanding balance must be zero before project can be formally closed
- D12.5 requires triple sign-off (PM + Head of Ops + Head of Finance) — all three signatures required

---

## Skipped artifacts

- `D12-Index` — navigation index only
- `D12 Master Support Database` — pipeline dashboard; rendered from `tool_instances` query
