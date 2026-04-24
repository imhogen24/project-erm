# Workbook 03 — Payment Scheduling and Fund Management Process

## Developer Reference

**Canonical schema:** `03_payment_scheduling_schema.json`
**Raw source (reference only):** `03_payment_scheduling_and_fund_management_process.json`

---

## Gate logic

This phase is unlocked when `projects.advance_cleared = true` (set by D2.14). D3.10 completion triggers the next engineering phase to unlock.

```
D3.1 → D3.2 (setup once)
         ↓
     [per milestone cycle]
D3.3 → D3.4 → D3.5 → D3.6 → D3.7 → D3.8 → D3.9 → D3.10
                                ↓ (if 21 days pass without payment)
                              D3.11 (conditional — overdue escalation)
```

---

## The repeating milestone cycle

**D3.1 and D3.2** are created once per project at the start of this phase.

**D3.3 through D3.10** repeat once per payment milestone. A typical 3-milestone project runs this cycle three times:

| Cycle | Milestone |
|---|---|
| 1 | Advance Payment (Contract Signing) |
| 2 | Fabrication Milestone (Design Approval) |
| 3 | Final Handover (System Delivery) |

In the DB, each cycle instance is a separate row in `tool_instances` keyed by `(project_id, tool_id, milestone_index)`. The schema adds a `repeating: true` flag on D3.3–D3.10 to signal this to the renderer and gate engine.

---

## D3.10 — the recurring unblock trigger

D3.10 is the Finance → Engineering gate for every milestone after the first. When D3.10 is signed off:

```sql
-- Update the relevant phase unblock flag and D3.2 ledger
UPDATE tool_instances
SET data = jsonb_set(data, '{variance_status}', '"Cleared"')
WHERE project_id = current_project_id
  AND tool_id = 'D3.2'
  AND milestone_index = current_milestone;

-- Unlock the next engineering phase tool
UPDATE projects
SET status = 'Phase N Active'
WHERE project_id = current_project_id;
```

---

## D3.11 — conditional overdue escalation

D3.11 is triggered when the payment clock (started at D3.6) exceeds 21 days without D3.7 detecting cleared funds. It runs in parallel with D3.7 monitoring — it does not replace the cycle.

When D3.11 `pm_notified_to_halt_work = true`:
- All downstream engineering tools for the blocked phase must be locked
- `projects.status` should reflect `Payment Overdue — Work Halted`

When D3.11 `escalated_to_head_of_ops = true`:
- Notify Head of Operations via the system notification center

---

## Auto-populated fields

- `project_client_name` — from D1.3 across all tools
- `link_to_executed_pdf`, `total_project_value_ghs` — from D2.12 into D3.1
- `contractual_milestone_value` — from D3.1 into D3.3
- `late_penalty` — from D3.1 compliance rules into D3.4 and D3.11
- `invoice_number`, `file_attached` — from D3.4 into D3.5, D3.6
- `amount_received_ghs`, `date_cleared_in_bank` — from D3.7/D3.8 into D3.9

---

## Database mapping

| Schema entity | DB table | Notes |
|---|---|---|
| Payment schedule baseline | `tool_instances` (D3.1 JSONB) | Set once per project |
| Live payment ledger | `tool_instances` (D3.2 JSONB) | Updated each milestone |
| Per-milestone cycle tools | `tool_instances` with `milestone_index` | D3.3–D3.10 repeat per milestone |
| Invoice status | `tool_instances` (D3.4/D3.5 JSONB) | `invoice_number` is queryable |
| Phase unblock signal | `projects.status` | Updated at D3.10 sign-off |

---

## Hard stops the UI must enforce

- D3.3 `client_formally_accepted_milestone = false` → block D3.4; PM must resolve client dispute first
- D3.3 `outstanding_engineering_disputes = true` → block D3.4; must be cleared before invoicing
- D3.5 any QC checklist item `= Fail` → block D3.6; Finance must fix the draft invoice
- D3.7 `routing_action = "No funds — continue monitoring"` → do not unlock D3.8; keep monitoring
- D3.8 `funds_fully_accounted = false` → block D3.9 and D3.10; Head of Finance must intervene
- D3.10 `financial_holds_remaining = true` → block next engineering phase unlock
- D3.11 `pm_notified_to_halt_work = true` → lock all active engineering tools for the blocked phase

---

## Skipped artifacts

- `D3-Index` — navigation index only
- `D3 Master Finance Database` — pipeline dashboard showing active receivables and overdue watchlist; rendered from `tool_instances` query, not a separate tool
