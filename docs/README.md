# README: IMHOGEN Engineering SOP & QMS Guide

## 1. System Overview

The IMHOGEN SOP is a modular, document-driven framework designed to manage the full lifecycle of industrial engineering projects — from a website inquiry to long-term maintenance.

The system is categorized into two primary **Service Tracks**:

- **Tier 1 (Heavy Engineering):** For original design, fabrication, and complex systems development.
- **Tier 3 (Drafting & Digitization):** A "Green Lane" for rapid reverse engineering, 3D modeling, and technical drawing of existing machinery.

---

## 2. Choosing Your Path (Routing Logic)

The very first step for any project occurs in **Workbook 01 (Onboarding)**. Use the following logic to determine which documents to fill:

| Project Type | Complexity | Routing Instructions |
|---|---|---|
| New Product / Custom Machine | High | Follow **Tier 1** (Sequence PID 1.1 through 12.5). |
| Drafting / Reverse Engineering | Medium | Follow **Tier 3** (Use bypass sheets labeled **T3.DX.XX**). |

---

## 3. Workbook Architecture (The 12 Pillars)

The system is spread across 12 functional workbooks. Each workbook is a "Gate"; a project cannot proceed to the next workbook until the mandatory "Lock" documents are signed.

### Phase A: Commercial & Planning

- **01 Onboarding:** Filters inquiries and defines technical operands.
  - *Key Gate:* **D1.15** (Project Brief) must be accepted by the client.
- **02 Contracting:** Maps technical needs into legal clauses.
  - *Key Gate:* **D2.12** (Executed Contract) must be signed.
- **03 Finance:** Manages the Fidelity Bank interface and milestone billing.
  - *Key Gate:* **D3.10** (Phase Unblock Notice) authorized by Finance.
- **04 Capacity:** Assigns specific technicians and CAD engineers.
  - *Key Gate:* **D4.8** (Locked Project Baseline) freezes the schedule.

### Phase B: Technical Execution

- **05 Engineering Design (Tier 1 Only):** Morphological synthesis and functional layout.
- **06 Drafting & Detailing (EDDMS):** Decomposition of the 3D model into 2D production drawings.
  - *Key Gate:* **D6.10** (CAD Lock) client formally accepts the geometry.
- **07 Procurement:** BOM extraction and vendor sourcing (Suame/Accra/International).
- **08 Fabrication:** Shop floor construction using Routing Travelers.
- **09 QA & Testing:** Dimensional audits and dynamic load testing.
  - *Key Gate:* **D9.7** (Final QA Certificate) clears the machine for delivery.

### Phase C: Handover & Support

- **10 Archiving:** "As-Built" CAD synchronization and Technical Data Package (TDP) assembly.
- **11 Delivery:** Logistical transit and Site Acceptance (SAT).
- **12 Support:** 30-day "Hyper-care" window and preventative maintenance contracts.

---

## 4. User Instructions (How to use the Sheets)

### Column Standards

- **DOCUMENT USED:** This tells you which previous sheet you must read to get the data required for the current sheet.
- **DOCUMENT GENERATED:** This is the output of your current task.
- **QUALITY CONTROL POINT:** The specific technical detail you must check before closing the sheet.

### Document Numbering Convention

- **D Series** (e.g., `D8.1`): Standard Tier 1 Process tool.
- **T3 Series** (e.g., `T3.D1.8a`): Specialized Tier 3 (Drafting) tool.
- **P Series** (e.g., `P5.4`): Pure Engineering Design/Logic tool.

---

## 5. Transition to ERM Application

This spreadsheet-based system is the **Functional Prototype** for the upcoming **IMHOGEN ERM Web App**.

- **Data Integrity:** Ensure Project IDs are consistent across all workbooks.
- **File Naming:** Use the convention `[ProjectID]_[DocID]_[Version]` (e.g., `PD177_D6.10_v1`) to ensure a smooth migration to the future database.

> **Governance Note:** Never skip a "Gate" document. The QMS is designed to catch errors (like ordering steel for a design the client hasn't approved). If a sheet is bypassed for Tier 3, use the designated **T3 Bypass Sheet** instead.
