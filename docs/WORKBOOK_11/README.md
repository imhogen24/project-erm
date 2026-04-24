# Workbook 11 — Product / Process Delivery Process

## Developer Reference

**Canonical schema:** `11_product_delivery_schema.json`
**Raw source (reference only):** `11_product_process_delivery_process.json`

---

## Gate logic

Unlocked in parallel with WB10 when D9.8 (Delivery Authorization Notice, WB09) is signed off. D11.5 (Final Billing Authorization) sign-off unlocks WB12.

```
D11.1 → D11.2 → D11.3 → D11.4 → D11.5
```

---

## DB writes at key tool completions

**D11.4 — Final Handover Certificate**

Client signature starts the warranty period:

```sql
UPDATE projects
SET handover_complete = true,
    handover_date = D11.4.handover_date,
    warranty_start_date = D11.4.handover_date
WHERE project_id = current_project_id;
```

**D11.5 — Final Billing Authorization**

```sql
UPDATE projects
SET final_invoice_authorized = true,
    final_invoice_value_ghs = D11.5.final_invoice_value_ghs
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_name` — from D1.3 across all tools

---

## Hard stops the UI must enforce

- D11.2 any item `condition = "Damaged"` → block D11.3; damaged items must be resolved (vendor claim or replacement) before site acceptance
- D11.3 any site check `status = "Fail"` → block D11.4; all site acceptance criteria must pass
- D11.3 any operator `status = "Requires Re-training"` → block D11.4; all operators must be assessed as competent
- D11.4 `client_satisfied = false` → block D11.5; client must formally accept before final billing
- D11.5 `invoice_authorized = false` → block WB12 unlock

---

## Skipped artifacts

- `D11-Index` — navigation index only
- `D11 Master Delivery Database` — pipeline dashboard; rendered from `tool_instances` query
