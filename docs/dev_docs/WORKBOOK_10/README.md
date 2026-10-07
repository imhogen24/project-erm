# Workbook 10 — Engineering Documentation and Archiving Process

## Developer Reference

**Canonical schema:** `10_engineering_documentation_schema.json`
**Raw source (reference only):** `10_engineering_documentation_and_archiving_process.json`

---

## Gate logic

Unlocked in parallel with WB11 when D9.8 (Delivery Authorization Notice, WB09) is signed off. D10.6 (Delivery & Handover Notice) sign-off closes the documentation phase. WB12 requires both WB10 and WB11 complete.

```
D10.1 → D10.2 → D10.3 → D10.4 → D10.5 → D10.6
```

---

## DB writes at key tool completions

**D10.4 — Digital Archiving & Vault Lock**

```sql
UPDATE projects
SET vault_locked = true,
    vault_lock_date = D10.4.archive_date,
    vault_root_path = D10.4.vault_root_path
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_name` — from D1.3 across all tools

---

## Hard stops the UI must enforce

- D10.1 any deviation with no `reason` or `impact` filled → block D10.2; all as-built deviations must be documented
- D10.2 any document `status != "Approved"` → block D10.3; all technical documents must be approved before TDP compilation
- D10.3 `tdp_complete = false` → block D10.4; vault lock requires complete TDP
- D10.4 any archive checklist item `status = "Pending"` → block D10.4 sign-off; all backup/lock actions must be confirmed
- D10.6 references D10.3 and D10.4 — both must be signed before D10.6 can be completed

---

## Skipped artifacts

- `D10-Index` — navigation index only
- `D10 Master Archival Database` — pipeline dashboard; rendered from `tool_instances` query
