# Workbook 06 — Client Review and Approval Process

## Developer Reference

**Canonical schema:** `06_client_review_and_approval_process_schema.json`
**Raw source (reference only):** `06_client_review_and_approval_process.json`

---

## Gate logic

This phase is unlocked when D6.5.2 (Master Model Decomposition, WB05) is signed off. D6.11 (Project Phase Closure Notice) sign-off sets `projects.status = 'Fabrication Phase'` and unlocks WB07/WB08.

**Tier 1 path:**
```
D6.5.1 → D6.5.3 → D6.5.4
                     ↓
[Repeating review cycle, one per revision round]
D6.1 → D6.2 → D6.3 → D6.4 → D6.5 → D6.6 → D6.7 → D6.8 → D6.9 → D6.10
                                                                      ↓ (when client accepts)
                                                                    D6.11
```

**Tier 3 path:**
```
T3.D6.5.0a → T3.D6.5.1a → D6.5.4
                                ↓
D6.1 → D6.2 → D6.3 → D6.4 → D6.5 → D6.6 → D6.7 → D6.8 → D6.9 → T3.D6.10a → D6.11
```

---

## Tier routing

| `service_track` | CAD Execution | Client Acceptance |
|---|---|---|
| `Tier_1` | D6.5.1 → D6.5.3 → D6.5.4 | D6.10 |
| `Tier_3` | T3.D6.5.0a → T3.D6.5.1a → D6.5.4 | T3.D6.10a |

D6.5.4 (QA & Drawing Review Log) and D6.1–D6.9, D6.11 are shared between both tiers.

---

## The repeating review cycle

D6.1–D6.10 form a repeating cycle. The cycle runs once per revision round:

| Round | Trigger |
|---|---|
| Round 1 | After D6.5.4 QA passes — initial TDP delivery |
| Round 2+ | Client requests revisions → D6.7 tickets executed → D6.8 revised TDP compiled |

In the DB, each cycle instance is a separate row in `tool_instances` keyed by `(project_id, tool_id, revision_round)`. Tools D6.1–D6.10 carry `repeating: true`.

D6.10 client acceptance (`client_accepts_design = true`) breaks the cycle and unlocks D6.11.

---

## D6.5.2 bridge

D6.5.2 (Master Model Decomposition) is defined in WB05's schema — it is the final output of the engineering design phase and the entry point for WB06's CAD execution. It is **not** re-defined here to avoid duplication. The D6.5.x series continues from D6.5.2:

```
WB05: ...→ D6.5.2
WB06: D6.5.1 (EDDMS Hub) → D6.5.2 (reference) → D6.5.3 (Drafting Engine) → D6.5.4 (QA)
```

D6.5.1 inherits `total_parts_assemblies` from the D6.5.2 BOM count.

---

## DB writes at key tool completions

**D6.10 — Delivery & Acceptance Form (T1) / T3.D6.10a (T3)**

Client signature sets the CAD lock flag:

```sql
UPDATE projects
SET cad_locked = true,
    cad_lock_date = D6.10.client_date,
    cad_tdp_version = D6.10.reference_tdp_version
WHERE project_id = current_project_id;
```

**D6.11 — Project Phase Closure Notice**

Sign-off unlocks the next phase:

```sql
UPDATE projects
SET status = 'Fabrication Phase'
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_client_name` / `project_name` — from D1.3 across all tools
- `project_machine_name` (D6.5.1 s1) — from D1.3
- `lead_engineer`, `lead_draftsman` (D6.5.1 s1) — from D4.3 roster
- `total_parts_assemblies` (D6.5.1 s1) — from D6.5.2 BOM count
- `reference_contract` (D6.6 s1) — from D2.12
- `reference_tdp_version` (D6.10 s1) — from D6.8

---

## Hard stops the UI must enforce

- D6.5.4 any `qa_assessment = "Fail"` with `issue_status != "Closed"` → block D6.1; all QA failures must be closed before TDP dispatch
- D6.3 `client_initial_reaction = "Rejected"` → escalate to Head of Ops; do not proceed to D6.4 without PM decision
- D6.6 any `directive = "Change Order Required"` → block D6.7; change order must be processed (WB02 flow) before revisions begin
- D6.9 any `status = "Fail"` → block re-dispatch of D6.8; Head of Engineering must sign off on failed points
- D6.10 `client_accepts_design = false` → block D6.11; client must formally accept before phase closure
- D6.11 `all_closure_items_done = false` → block sign-off; all CAD lock actions must be confirmed done

---

## Skipped artifacts

- `D6-Index` (D6.i Document Control Index) — navigation index only
- `D6 Master Revision Database` — pipeline dashboard showing active reviews and revision status; rendered from `tool_instances` query, not a separate tool
