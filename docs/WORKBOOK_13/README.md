# Workbook 13 — Marketing and Business Development

## Developer Reference

**Canonical schema:** `13_marketing_business_dev_schema.json`
**Raw source (reference only):** `13_marketing_and_business_development.json`

---

## Overview

WB13 is not part of the sequential QMS pipeline. It runs asynchronously after D12.4 (Final Operational Audit), triggered when a project is marked suitable for marketing content. Client consent (`client_consent_to_publish = true` on MDS.1.1) is a hard prerequisite before any content is produced or published.

There is no phase unlock associated with WB13 — it does not gate any other workbook.

---

## Gate logic

```
D12.4 complete + client consent → MDS.1.1 → MDS.1.2 → MDS.1.3 → MDS.1.4
```

MDS.1.4 (Hub Synchronization & Confidentiality Sign-off) is the PM's final review before publish. All confidentiality checks must pass before the Marketing Hub publish action is triggered.

---

## Tier routing

Both Tier 1 and Tier 3 projects can feed WB13. The `client_consent_to_publish` flag on MDS.1.1 is the only hard gate.

---

## Auto-populated fields

- `project_name` — from D1.3

---

## Hard stops the UI must enforce

- MDS.1.1 `client_consent_to_publish = false` → block MDS.1.2 and MDS.1.3; no marketing content may be produced or published without explicit client consent
- MDS.1.3 any content item `cleared_for_publish = false` → block publish action for that item

---

## Skipped artifacts

- First sheet (empty index/SOP breakdown) — no form fields, navigation artifact only
