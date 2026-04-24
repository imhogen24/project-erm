# Workbook 01 — Project Onboarding and Definition Process

## Developer Reference

**Canonical schema:** `01_project_onboarding_schema.json`
**Raw source (reference only):** `01_project_onboarding.json`

---

## Gate logic

This phase starts when a client submits an inquiry and ends when D1.16 (Handoff Meeting Minutes) is signed off. The handoff unlocks WB02 (Contracting).

Sequential lock order:

```
D1.1 → D1.2 → D1.3 / T3.D1.3a → D1.4 → D1.5 → D1.6 → D1.7
     → D1.8 / T3.D1.8a → D1.9 → D1.10 → D1.11 → D1.12
     → D1.13 → D1.14 → D1.15 / T3.D1.15a → D1.16
```

Each tool is locked read-only once the PM approves it. The next tool in the chain is only unlocked after that approval.

---

## Tier routing

The `service_track` field on the `projects` table controls which tool variants are shown:

| `service_track` | Tools shown |
|---|---|
| `Tier_1` | D1.1 → D1.16 (standard path) |
| `Tier_3` | Replaces D1.3 with T3.D1.3a, D1.8 with T3.D1.8a, D1.15 with T3.D1.15a |

Tier 3 skips the discovery meeting path (D1.5 → D1.7) — the client provides assets directly, so the intake goes straight to metrology (T3.D1.8a).

---

## Auto-populated fields

Do not render these as editable inputs. Pull from the `projects` table and display in the UI top bar or as read-only context:

- `project_request_id` — generated on project creation, always visible in the top bar
- `prepared_by` / `lead_engineer` — resolved from `project_assignments` via `staff_id`
- `date` fields on approval rows — system timestamp at the moment of PM sign-off

Fields marked `inherited_from` in the schema are auto-populated from the referenced tool's saved data and rendered read-only on the receiving tool. Example: `client_name` on D1.15 inherits from D1.3.

---

## Pre-populated table rows

Tables with `prefilled_rows` ship with fixed category rows that the user cannot add or delete — only fill in the cells. Examples:

- D1.3 / D1.8 operands: Material, Energy, Information, Living thing
- D1.8 operators: Human System, Technical System, Active Environment, Management System, Information System
- D1.12 capability domains: Engineering & Design, Manufacturing & Tools, Supply Chain & Materials, Resource Bandwidth

Render these rows as locked in the first column, editable in the remaining columns.

---

## Database mapping

| Schema entity | DB table | Notes |
|---|---|---|
| Project record | `projects` | Created at D1.1 submission; `status` updates at each gate |
| Client record | `clients` | Populated from D1.3 client fields |
| Tool instances | `tool_instances` | One row per `(project_id, tool_id)`; stores JSONB form data |
| Staff assignments | `project_assignments` | PM and Lead Engineer linked at D1.9 |

The `master_database` section in `01_project_onboarding.json` is a dead conversion artifact. It maps to the `projects` table — which is populated automatically as tools are filled and approved, not manually.

---

## Hard stops the UI must enforce

- D1.2 `triage_decision = "Reject as Spam"` → project status set to `Rejected`; no further tools unlock
- D1.10 `overall_capability_status = "Not Capable"` → block D1.11; surface rejection workflow to PM
- D1.11 `go_no_go_decision = "No-Go"` → block D1.12; PM must close the project record
- D1.14 `minimum_overhead_met = false` → block routing to D1.15; Finance must review
