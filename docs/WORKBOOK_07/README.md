# Workbook 07 — Procurement Process

## Developer Reference

**Canonical schema:** `07_procurement_process_schema.json`
**Raw source (reference only):** `07_procurement_process.json`

---

## Gate logic

This phase is unlocked when D6.11 (Project Phase Closure Notice, WB06) is signed off. D7.7 (Updated Inventory Ledger) sign-off sets `projects.status = 'Fabrication Phase'` and unlocks WB08.

**Standard sequential path:**
```
D7.1 → D7.2 → D7.3 → D7.4 → D7.5 → D7.6 → D7.7
```

---

## Repeating tools

D7.3, D7.4, D7.5, and D7.6 repeat per vendor/category. Multiple instances run in parallel:

```
D7.2
  ↓ (one per procurement category)
D7.3 (RFQ) ×N → D7.4 (Vendor Matrix) ×N → D7.5 (PO) ×N → D7.6 (Inspection) ×N
                                                                    ↓ (all POs received)
                                                                   D7.7
```

In the DB, repeating instances use `(project_id, tool_id, procurement_category_index)` as the composite key. D7.7 is created once and collates all received stock.

**Minimum quote rule**: D7.4 requires at least 3 vendor quotes for any item > GHS 5,000. The UI should enforce this by counting D7.3 instances for the same category before allowing D7.4 sign-off.

---

## DB writes at key tool completions

**D7.7 — Updated Inventory Ledger**

Sign-off confirms all BOM items are staged and unlocks fabrication:

```sql
UPDATE projects
SET status = 'Fabrication Phase',
    procurement_complete_date = D7.7.date_signed
WHERE project_id = current_project_id;
```

---

## Auto-populated fields

- `project_client_name` — from D1.3 across all tools
- `total_allocated_bom_budget_ghs` (D7.2 s1) — from D4.8 `total_approved_budget_ghs`
- `vendor_name` (D7.5 s1) — from D7.4 `approved_vendor`
- `reference_po_number` (D7.6 s1) — from D7.5 `po_number`

---

## Auto-generated fields

- `rfq_number` (D7.3) — system-generated on creation, format `IMHO-RFQ-YY-NNN`
- `po_number` (D7.5) — system-generated on creation, format `IMHO-PO-YY-NNN`

---

## Hard stops the UI must enforce

- D7.2 `within_budget = false` → block D7.3; Head of Operations must approve budget overrun before any RFQs are issued
- D7.4 fewer than 3 D7.3 instances for items > GHS 5,000 → block D7.4 sign-off; minimum quote rule not met
- D7.5 `po_total_value_ghs` exceeds D7.4 `approved_total_value_ghs` → block D7.5 sign-off; value mismatch must be resolved
- D7.6 any `qa_status = "Rejected — Return to Vendor"` with open shortfall → block D7.7; all shortfalls must be resolved (replacement received or PM waiver)
- D7.6 any `qty_received < qty_ordered` for critical BOM items → flag for PM review before D7.7
- D7.7 `all_bom_items_staged = false` → block sign-off and WB08 unlock

---

## Skipped artifacts

- `D7-Index` — navigation index only
- `D7 Master Procurement Database` — pipeline dashboard; rendered from `tool_instances` query filtered by active procurement status
