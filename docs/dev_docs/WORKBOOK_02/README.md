# Workbook 02 — Contract Tracking and Administration Process

## Developer Reference

**Canonical schema:** `02_contract_tracking_schema.json`
**Raw source (reference only):** `02_contract_tracking.json`

---

## Gate logic

This phase starts when D1.16 (Handoff Meeting Minutes) is signed off in WB01. It ends when D2.14 (Phase Initiation Notice) is completed and the advance payment is confirmed cleared. D2.14 unlocks WB03.

Standard sequential lock order:

```
D2.1 (system) → D2.2 → D2.3 → D2.4 → D2.5 → D2.6 → D2.7
```

After D2.7, the path forks based on `initial_client_response`:

```
Accepted as-is   → D2.11 → D2.12 → D2.13 → D2.14
Requested Neg.   → D2.8  → D2.9  → D2.10 → D2.11 → D2.12 → D2.13 → D2.14
```

---

## Tier routing

| `service_track` | Tools |
|---|---|
| `Tier_1` | Full path D2.2 → D2.14 |
| `Tier_3` | Replaces D2.2 with T3.D2.2a (simpler IP/liability contract); rest of path is the same |

---

## Conditional tool logic

**D2.8, D2.9, D2.10** are conditional — they only unlock if `D2.7.initial_client_response = "Requested Negotiation"`. If the client accepts as-is, these three tools are skipped and D2.11 unlocks directly from D2.7.

Enforce this in the gate engine: check `D2.7.initial_client_response` before deciding which tool unlocks next.

**D2.10.pricing_changed_during_negotiation** drives a sub-gate inside D2.10: if `true`, the Finance re-verification fields become required before D2.10 can be approved.

---

## The critical trigger: advance_cleared

D2.14 is the most important tool in this workbook from a system logic perspective.

When the PM completes D2.14 section s2 (Financial Clearance) and the Head of Ops signs off:

```sql
UPDATE projects
SET advance_cleared = true,
    status = 'Active Engineering Phase',
    baseline_start = D2.14.official_project_start_date
WHERE project_id = current_project_id;
```

This is the hard gate that unlocks WB03. The "Assign Team" and all Phase 3+ buttons remain disabled until `advance_cleared = true`.

---

## D2.1 is a system tool, not a project tool

D2.1 (Standard Contract Template) is not per-project. It is managed once by Contract Admin and its clauses are pulled into D2.2 for every project. In the DB it maps to a `contract_clauses` table, not `tool_instances`. The UI should have a separate admin interface for editing D2.1 clauses — it should not appear in a project's tool list.

---

## Auto-populated fields

- `project_client_name` — inherited from D1.3 across all tools
- `overall_project_value` — inherited from D1.15 into D2.2, D2.5, D2.12
- `assigned_pm` — inherited from D1.16 into D2.2, D2.14
- `client_signatory` — inherited from D1.3 into D2.11
- `advance_invoice_number` and `amount_expected_ghs` — inherited from D2.12 into D2.14
- `imhogen_hard_limits` — inherited from D2.6 baseline record into D2.8

---

## Database mapping

| Schema entity | DB table | Notes |
|---|---|---|
| Contract boilerplate clauses | `contract_clauses` | Managed via D2.1 admin tool |
| Per-project tool data | `tool_instances` | D2.2 through D2.14, one row per (project_id, tool_id) |
| Advance payment cleared | `projects.advance_cleared` | Boolean set by D2.14 sign-off |
| Project status | `projects.status` | Set to 'Active Engineering Phase' at D2.14 |
| Baseline start date | `projects.baseline_start` | Set from D2.14 official_project_start_date |
| Executed contract file | S3 + `tool_instances` JSONB | `link_to_executed_pdf` stored in D2.12 JSONB |

---

## Hard stops the UI must enforce

- D2.3 `operational_verification_status = "Revisions Required"` → lock D2.4; route back to Contract Admin
- D2.4 `commercial_verification_status = "Revisions Required"` → lock D2.5; route back to Contract Admin
- D2.5 `executive_decision = "Rejected"` → close project or hold; do not unlock D2.6
- D2.9 `meeting_outcome = "Deadlock"` → escalate to Head of R&D; do not unlock D2.10
- D2.9 `meeting_outcome = "Client Withdrawn"` → project status set to Closed/Lost
- D2.14 financial clearance not complete → block WB03 unlock regardless of other fields
- `D2.10.overhead_still_met = false` → block D2.11; Finance must review and re-approve

---

## Skipped artifacts

- `2.i Document Control` — navigation index in the spreadsheet, no equivalent in ERM
- `D2 Master Contract Database` — pipeline dashboard, maps to the `projects` table filtered by `status = 'Contracting'`
