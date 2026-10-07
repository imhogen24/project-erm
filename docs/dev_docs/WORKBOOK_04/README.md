# Workbook 04 — Team Assignment and Capacity Planning Process

## Developer Reference

**Canonical schema:** `04_team_assignment_schema.json`
**Raw source (reference only):** `04_team_assignment_and_capacity_planning_process.json`

---

## Gate logic

This phase is unlocked when `projects.advance_cleared = true` (set by D2.14). D4.8 sign-off sets `projects.baseline_start` and `projects.baseline_end`, which triggers engineering execution phases to begin.

**Tier 1 path (full):**
```
D4.1 → D4.2 → D4.3 → D4.4 → D4.5 → D4.6 → D4.7 → D4.8
```

**Tier 3 path (bypass):**
```
T3.D4.8a  (single tool — replaces D4.1 through D4.8 entirely)
```

---

## Tier routing

| `service_track` | Tools |
|---|---|
| `Tier_1` | Full path D4.1 → D4.8 |
| `Tier_3` | T3.D4.8a only — all T1 tools in this workbook are skipped |

T3.D4.8a is a fast-track form for jobs under 5 days. It compresses assignment, access provisioning, technical baseline, and kick-off acknowledgement into a single sign-off. No formal capacity review or kick-off meeting is required.

---

## DB writes at key tool completions

**D4.3 — Team Assignment & Provisioning Record**

Sign-off populates `project_assignments` (one row per assigned engineer) and writes `pm_id` and `lead_eng_id` on the `projects` table:

```sql
INSERT INTO project_assignments (project_id, user_id, role, allocated_days)
SELECT current_project_id, ...
FROM roster_data;

UPDATE projects
SET pm_id = <assigned_pm>,
    lead_eng_id = <lead_engineer>
WHERE project_id = current_project_id;
```

**D4.4 — Access Confirmation Log**

Sign-off sets `it_provisioned = true` on `project_assignments`, unblocking the PM kick-off button:

```sql
UPDATE project_assignments
SET it_provisioned = true
WHERE project_id = current_project_id;
```

**D4.8 — Locked Project Baseline**

Sign-off writes the golden baseline. All future performance reporting measures against these dates. Must not be altered after lock:

```sql
UPDATE projects
SET baseline_start = <earliest phase start date>,
    baseline_end   = <final phase end date>
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_client_name` — from D1.3 across all tools
- `reference_contract_link` — from D2.12 into D4.1
- `target_project_start_date` — from D2.14 into D4.1
- `total_budgeted_labor_ghs` — from D1.14 into D4.2 and D4.8
- `required_attendees` (D4.6) — from the locked roster in D4.3
- `resource_baseline` engineer/role columns (D4.8 s3) — prefilled from D4.3 roster

---

## Hard stops the UI must enforce

- D4.2 `all_roles_filled_and_approved = false` → block D4.3; Head of Engineering must resolve all staffing conflicts first
- D4.4 `engineers_confirmed_access = false` → block D4.5; all access must be confirmed before kick-off prep begins
- D4.7 `team_clear_on_phase1 = false` → block D4.8; PM must resolve open questions before baseline lock
- D4.8 `matches_contract_timeline = false` → block D4.8 sign-off; baseline must align with D2.12 contract dates
- `it_provisioned = false` on any `project_assignments` row → PM kick-off button (D4.5) remains disabled

---

## Skipped artifacts

- `D4-Index` — navigation index only
- `D4 Master Capacity Tracker` — pipeline dashboard showing engineer utilization; rendered from `project_assignments` query, not a separate tool
