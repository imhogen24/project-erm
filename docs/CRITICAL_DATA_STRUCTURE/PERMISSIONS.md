# Permissions Matrix

**Legend:** `RW` = Read/Write · `RO` = Read Only · `RA` = Review/Approve · `-` = No Access

Agents: **Client · OM** (Onboarding Manager) **· PM** (Project Manager) **· LE** (Lead Engineer) **· AE** (Assigned Engineer) **· LD** (Lead Draftsman) **· FO** (Finance Officer) **· CA** (Contract Administrator) **· HE** (Head of Engineering) **· PO** (Procurement Officer) **· IO** (Inventory Officer) **· WS** (Workshop Supervisor) **· T** (Technician) **· QA** (QA Officer) **· LFE** (Field Engineer) **· LO** (Logistics Officer) **· CR** (Client Relations) **· IT/Admin · MKT** (Marketing Hub)

---

## Phase 1 — Project Onboarding & Definition

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D1.1 | Client Email / Web Form | RW | RO | RO | - | - | - | - | - | - | - | - | - | - | - | - | RO | RO | - | |
| D1.2 | Initial Inquiry Notification | - | RW | RO | - | - | - | - | RO | - | - | - | - | - | - | - | RO | RO | - | |
| D1.3 | Received Request Record | - | RW | RA | - | - | - | - | RO | - | - | - | - | - | - | - | RO | RO | - | |
| D1.4 | Acknowledgment Email | RO | RW | RO | - | - | - | - | RO | - | - | - | - | - | - | - | RO | RO | - | |
| D1.5 | Meeting Proposal | RO | RW | RO | RO | - | - | - | RO | - | - | - | - | - | - | - | RO | RO | - | |
| D1.6 | Calendar & Agenda | RO | RW | RO | RO | - | - | - | RO | - | - | - | - | - | - | - | RO | RO | - | |
| D1.7 | Raw Meeting Notes | RO | RW | RA | RO | - | - | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D1.8 | Needs Assessment | RO | RO | RA | RW | - | - | - | - | - | - | - | - | - | - | - | - | RO | - | |
| T3.D1.8a | Tier 3 Drafting / Reverse Engineering | - | RO | RO | RA | RW | RO | - | - | RO | - | - | - | - | RO | - | - | RO | - | |
| D1.9 | Internal Review Request | - | RW | RO | RO | - | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| D1.10 | Capability Assessment | - | RO | RA | RW | - | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D1.11 | Risk Assessment | - | RO | RA | RW | - | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D1.12 | Feasibility Report | RO | RO | RA | RW | - | - | - | - | RO | - | - | - | - | RO | - | - | RO | RO | - |
| D1.13 | Draft Scope of Work | RO | RO | RA | RW | - | - | RO | - | - | - | - | - | - | - | - | - | RO | RO | - |
| D1.14 | Cost Estimation Sheet | - | RO | RA | RW | - | - | RO | - | - | - | - | - | - | - | - | - | RO | RO | - |
| D1.15 | Project Brief & Budget | RO | RO | RA | RW | - | - | RO | - | - | - | - | - | - | - | - | - | RO | RO | - |
| D1.16 | Handoff Meeting Minutes | - | RO | RA | RW | - | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |

---

## Phase 2 — Contract Administration

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D2.1 | Standard Contract Template | - | - | RO | - | - | - | - | RW | RO | - | - | - | - | - | - | - | RO | - | |
| D2.2 | Initial Draft Contract | - | - | RO | - | - | - | - | RW | - | - | - | - | - | - | - | - | RO | - | |
| D2.3 | PM Review Draft | - | - | RA | - | - | - | - | RO | - | - | - | - | - | - | - | - | RO | - | |
| D2.4 | Finance Review Draft | - | - | RO | - | - | - | RA | RO | - | - | - | - | - | - | - | - | RO | - | |
| D2.5 | Executive Review Draft | - | - | RO | - | - | - | RO | RO | RA | - | - | - | - | - | - | - | RO | - | |
| D2.6 | Internally Approved Draft | - | - | RO | - | - | - | RO | RW | RO | - | - | - | - | - | - | - | RO | - | |
| D2.7 | Client Transmitted Record | RO | - | RO | - | - | - | - | RW | - | - | - | - | - | - | - | - | RO | - | |
| D2.8 | Negotiation Meeting Invite | RO | - | RO | - | - | - | - | RW | - | - | - | - | - | - | - | RO | RO | - | |
| D2.9 | Negotiation Meeting Notes | RO | - | RO | - | - | - | - | RW | RO | - | - | - | - | - | - | - | RO | - | |
| D2.10 | Finalized Contract | RO | - | RO | - | - | - | RO | RW | RO | - | - | - | - | - | - | - | RO | - | |
| D2.11 | Pending Signature Contract | RW | - | RO | - | - | - | - | RW | RW | - | - | - | - | - | - | - | RO | - | |
| D2.12 | Executed Contract & Audit Trail | RO | - | RO | - | - | - | RO | RW | RO | - | - | - | - | - | - | - | RO | - | |
| D2.13 | Archived Contract Record | - | - | RO | - | - | - | - | RW | - | - | - | - | - | - | - | - | RO | - | |
| D2.14 | Phase Initiation Notice | - | - | RA | - | - | - | RO | RW | - | - | - | - | - | - | - | - | RO | - | |
| D2 | Master Contract Database | - | - | RO | - | - | - | RO | RW | - | - | - | - | - | - | - | - | RO | - | |
| T3.D2.2a | Tier 3 Service Contract Sheet | RO | RW | RA | RO | RO | - | RO | RO | RO | - | - | - | - | - | - | - | RO | - | |

---

## Phase 3 — Finance & Payment

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D3.1 | Payment Terms Extract | RO | - | RA | - | - | - | RW | RO | - | - | - | - | - | - | - | - | RO | - | |
| D3.2 | System Payment Record | - | - | RO | - | - | - | RW | - | - | - | - | - | - | - | - | - | RO | - | |
| D3.3 | Milestone Billing Trigger | - | - | RW | - | - | - | RO | - | RO | - | - | - | - | - | - | - | RO | - | |
| D3.4 | Draft Invoice | - | - | RO | - | - | - | RW | - | - | - | - | - | - | - | - | - | RO | - | |
| D3.5 | Approved Invoice | - | - | RA | - | - | - | RW | - | RO | - | - | - | - | - | - | - | RO | - | |
| D3.6 | Transmitted Invoice Record | RO | - | RO | - | - | - | RW | - | - | - | - | - | - | - | - | - | RO | - | |
| D3.7 | Daily Bank Statement Log | - | - | RO | - | - | - | RW | - | - | - | - | - | - | - | - | - | RO | - | |
| D3.8 | Reconciled Payment Log | - | - | RA | - | - | - | RW | - | RO | - | - | - | - | - | - | - | RO | - | |
| D3.9 | Payment Receipt | RO | - | RO | - | - | - | RW | - | - | - | - | - | - | - | - | - | RO | - | |
| D3.10 | Phase Unblock Notice | - | - | RA | - | - | - | RW | - | RO | - | - | - | - | - | - | - | RO | - | |
| D3.11 | Overdue Accounts Report | RO | - | RO | - | - | - | RW | - | RO | - | - | - | - | - | - | RO | RO | - | |

---

## Phase 4 — Capacity & Execution Control

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D4 | Master Capacity Tracker | - | RO | RA | - | - | - | - | - | RW | - | - | - | - | - | - | - | RO | - | |
| D4.1 | Technical Requirement Notes | - | RO | RA | RW | RO | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D4.2 | Resource Request Form | - | RO | RA | RW | RO | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D4.3 | Team Assignment & Provisioning Record | - | - | RA | RW | RO | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D4.4 | Access Confirmation Log | - | - | RA | RO | RO | RO | - | - | RW | - | - | - | - | - | - | - | RO | - | |
| D4.5 | Internal Kick-off Deck (Link) | - | - | RA | RW | RO | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D4.6 | Kick-off Calendar Invite & Agenda | RO | - | RW | RO | RO | RO | - | - | - | - | - | - | - | - | - | RO | RO | - | |
| D4.7 | Kick-off Meeting Minutes | RO | - | RO | RW | RO | RO | - | - | - | - | - | - | - | - | - | RO | RO | - | |
| T3.D4.8a | Drafting Assignment & Baseline (Tier 3) | - | RO | RA | RO | RW | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D4.8 | Locked Project Baseline | - | - | RA | RO | - | - | - | - | RW | - | - | - | - | - | - | - | RO | - | |

---

## Phase 5 — Engineering Design

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P1.0 | Master Requirements Register | RO | - | RO | RW | RO | - | - | - | RA | - | - | - | - | RO | - | - | RO | - | |
| P2.0 | Master Capacity & Execution Plan | - | - | RO | RW | - | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| Pr2.1 | ERM Gantt Chart (Auto) | - | - | RO | - | - | - | - | - | - | - | - | - | - | - | - | - | RO | - | |
| P3.1 | Transformation Process Definition | RO | - | RO | RW | RO | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P3.1a | Technical Process Description | - | - | - | RW | RO | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P3.1b | Technical Process Diagram | - | - | - | RW | RO | RO | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P3.2 | TS Function Structure Definition | - | - | - | RW | RO | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P3.2b | Evoked Function Structure Definition | - | - | - | RW | RO | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P3.3 | TS Function Structure Representation | - | - | - | RW | RO | RO | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P4.1A | Morphological Matrix | - | - | - | RO | RW | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P4.1B | Function-Based Morphological Matrix | - | - | - | RO | RW | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P4.1C | Concept Synthesis | - | - | - | RO | RW | - | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P4.1D | Evaluated Concept Synthesis | - | - | - | RO | RW | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P4.2A | Topological Principles Definition | - | - | - | RO | RW | - | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P4.2B | Topological Representation (Icons) | - | - | - | RO | RW | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P4.2C | Organ Design from Functional Requirements | - | - | - | RO | RW | RO | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P4.2D | Final Organ Structure Definition | RO | - | RO | RW | RO | RO | - | - | RA | - | - | - | - | RO | - | - | RO | - | |
| P5.1A | Consolidated Requirement List | - | - | RO | RW | RO | - | - | - | RA | - | - | - | - | RO | - | - | RO | - | |
| P5.1B | Validated Requirement Set | - | - | RO | RW | RO | - | - | - | RA | - | - | - | - | RO | - | - | RO | - | |
| P5.2 | Construction Concept Development | - | - | - | RO | RW | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P5.3 | Construction Elaboration | - | - | - | RO | RW | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P5.3.1 | Preliminary Layout Representation | - | - | - | RO | RW | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P5.4 | Construction Group Definition | - | - | - | RO | RW | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| P5.4.1 | Construction Structure Definition | - | - | RO | RO | RW | RO | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| P6 | Master Model Decomposition | - | - | RO | RO | RW | RO | - | - | RA | - | - | - | - | RO | - | - | RO | - | |

---

## Phase 6 — EDDMS

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DT3.D6.5.0a | Reverse Engineering | - | - | RO | RA | RW | RO | - | - | RO | - | - | - | - | RO | - | - | RO | - | |
| DT3.D6.5.1a | 3D Modeling Execution | - | - | RO | RA | RW | RO | - | - | RO | - | - | - | - | RO | - | - | RO | - | |
| D6.5.1 | EDDMS Project Hub & Title | - | - | RW | RO | RO | RO | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.5.2 | Master Model Decomposition | - | - | RO | RW | RO | RO | - | - | RO | - | - | - | - | - | - | - | RO | - | |
| D6.5.3 | Drafting Execution Record | - | - | RO | RO | RW | RO | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.5.4 | Final QA & Drawing Review | RO | - | RO | RA | RO | RW | - | - | RA | - | - | - | - | - | - | - | RO | - | |

---

## Phase 6 — Client Review & Approval

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D6 | Master Revision Database | - | - | RO | - | - | - | RW | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.1 | Client Delivery Transmittal (Link) | RO | - | RW | RO | - | - | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.2 | Presentation Meeting Invite | RO | - | RW | RO | RO | RO | - | - | - | - | - | - | - | - | - | RO | RO | - | |
| D6.3 | Presentation Meeting Minutes | RO | - | RW | RO | RO | RO | - | - | - | - | - | - | - | - | - | RO | RO | - | |
| D6.4 | Client Feedback Form | RW | - | RO | RO | - | - | - | - | - | - | - | - | - | - | - | RO | RO | - | |
| D6.5 | Master Revision Log | - | - | RW | RO | RO | RO | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.6 | Scope Assessment Report | - | - | RW | RA | RO | RO | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.7 | Engineering Revision Tickets | - | - | RW | RO | RO | RW | - | - | - | - | - | - | - | - | - | - | RO | - | |
| D6.8 | Revised Technical Data Package | RO | - | RO | RA | RW | RO | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| D6.9 | Revision QA Sign-off | RO | - | RO | RA | RO | RW | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| D6.10 | Delivery & Acceptance Form | RW | - | RO | - | - | - | - | - | RW | - | - | - | - | - | - | - | RO | - | |
| T3.D6.10a | Drafting Final Approval & Asset Delivery | RO | - | RO | RA | RW | RO | - | - | RA | - | - | - | - | - | - | - | RO | - | |
| D6.11 | Project Phase Closure Notice | - | - | RA | RO | RO | RO | - | - | - | - | - | - | - | - | - | - | RO | - | |

---

## Phase 7 — Procurement Process

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D7 | Master Procurement Database | - | - | RO | - | - | - | RO | - | - | RW | - | - | - | - | - | - | RO | - | |
| D7.1 | Final CAD Bill of Materials (BOM) | RO | - | RO | RA | RW | RO | - | - | RO | RO | - | - | - | - | - | - | RO | - | |
| D7.2 | Procurement List & Budget Allocation | - | - | RO | RO | RO | - | RA | - | - | RW | - | - | - | - | - | - | RO | - | |
| D7.3 | Request for Quotation (RFQ) Form | - | - | RO | RO | - | - | RO | - | - | RW | - | - | - | - | - | - | RO | - | |
| D7.4 | Vendor Selection Matrix | - | - | RO | RO | - | - | RO | - | RA | RW | - | - | - | - | - | - | RO | - | |
| D7.5 | Approved Purchase Order (PO) | - | - | RO | - | - | - | RA | - | RO | RW | - | - | - | - | - | - | RO | - | |
| D7.6 | Incoming Inspection Report & Receiving Log | - | - | RO | RO | - | - | - | - | - | RO | RW | - | - | RA | - | - | RO | - | |
| D7.7 | Updated Inventory Ledger & Handover | - | - | RO | RO | - | - | - | - | - | RO | RW | - | - | RO | - | RA | RO | - | |

---

## Phase 8 — Fabrication & Construction

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D8 | Master Fabrication Database | - | - | RO | - | - | - | - | - | - | RO | - | RW | - | - | - | - | RO | - | |
| D8.1 | Job Process Sheet (Work Order) | - | - | RO | RA | RO | RO | - | - | RO | RO | RO | RW | - | - | - | - | RO | - | |
| D8.2 | Tooling & Setup Checklist | - | - | RO | RO | - | - | - | - | - | - | RO | RW | - | - | - | - | RO | - | |
| D8.3 | Safety Briefing & PPE Log | - | - | RO | RO | - | - | - | - | - | - | RO | RW | RA | - | - | - | RO | - | |
| D8.4 | Fabrication Routing Traveler | - | - | RO | RA | RO | RO | - | - | RO | RO | RO | RW | - | - | - | - | RO | - | |
| D8.5 | In-Process QC Log | - | - | RO | RO | - | - | - | - | - | - | RO | RW | - | RA | - | - | RO | - | |
| D8.6 | Fabrication Completion Notice | RO | - | RO | RA | RO | RO | - | - | RO | RO | RO | RW | - | RA | - | - | RO | - | |

---

## Phase 9 — Quality Control & Testing

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D9 | Master QA Database | - | - | RO | - | - | - | - | - | - | - | - | - | - | RW | - | - | RO | - | |
| D9.1 | QA Testing Checklist (Preparation) | - | - | RO | RO | - | - | - | - | - | - | RO | RO | RO | RW | - | - | RO | - | |
| D9.2 | Visual Inspection Log | - | - | RO | RO | - | - | - | - | - | - | RO | RO | RO | RW | - | - | RO | - | |
| D9.3 | Dimensional Audit Report | - | - | RO | RA | - | - | - | - | - | - | RO | RO | RO | RW | - | - | RO | - | |
| D9.4 | Load & Function Test Report | - | - | RO | RA | - | - | - | - | - | - | RO | RO | RO | RW | - | - | RO | - | |
| D9.5 | Non-Conformance Report (NCR) | - | - | RO | RA | RO | RO | - | - | - | - | RO | RO | RO | RW | - | - | RO | - | |
| D9.6 | Rework Action Order | - | - | RO | RA | RO | RO | - | - | - | - | RO | RW | RO | RW | - | - | RO | - | |
| D9.7 | Final QA Release Certificate | RO | - | RO | RA | - | - | - | - | RA | - | RO | RO | RO | RW | - | - | RO | - | |
| D9.8 | Delivery Authorization Notice | RO | - | RA | RO | - | - | - | - | RO | - | RO | RO | RO | RW | - | - | RO | - | |

---

## Phase 10 — Engineering Documentation & Archiving

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D10 | Master Archival Database | - | - | RO | - | - | - | - | - | - | - | - | - | - | - | - | - | RW | - | |
| D10.1 | As-Built Modification Record | RO | - | RO | RA | RW | RO | - | - | RO | - | - | - | - | RO | - | - | RW | - | |
| D10.2 | Technical Authoring Tracker | - | - | RO | RW | RO | RO | - | - | RO | - | - | - | - | RO | - | - | RW | - | |
| D10.3 | Final Technical Data Package (TDP) Manifest | RO | - | RO | RA | RW | RO | - | - | RA | - | - | - | - | RO | - | - | RW | - | |
| D10.4 | Digital Archiving & Vault Lock Record | - | - | RO | RO | - | - | - | - | RA | - | - | - | - | RO | - | - | RW | - | |
| D10.5 | R&D Lessons Learned Log | - | - | RW | RO | RO | RO | - | - | RO | - | - | - | - | RO | - | - | RW | - | |
| D10.6 | Delivery & Handover Notice | RO | - | RA | RO | - | - | - | - | RO | - | - | - | - | RO | - | RA | RW | - | |

---

## Phase 11 — Product & Process Delivery

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D11 | Master Delivery Database | - | - | RO | - | - | - | - | - | - | - | - | - | - | - | - | RW | - | RO | - |
| D11.1 | Dispatch Schedule & Transport Waybill | RO | - | RO | - | - | - | - | - | - | RO | RW | - | - | - | - | RW | - | RO | - |
| D11.2 | Post-Transit Inspection Log | RO | - | RO | - | - | - | - | - | - | - | RW | - | - | RA | - | RO | - | RO | - |
| D11.3 | Site Acceptance & Training Record | RW | - | RO | RO | - | - | - | - | - | - | RO | - | - | RO | RW | RO | - | RO | - |
| D11.4 | Final Handover Certificate | RW | - | RO | RO | - | - | - | - | RA | - | RO | - | - | RO | RO | RW | - | RO | - |
| D11.5 | Final Billing Authorization | - | - | RO | - | - | - | RW | - | RA | - | - | - | - | - | - | RO | - | RO | - |

---

## Phase 12 — Training & Post-Delivery Support

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| D12 | Master Support & Maintenance Database | - | - | RO | - | - | - | - | - | - | - | - | - | - | - | - | - | RW | - | |
| D12.1 | Operator Training Syllabus & Schedule | RO | - | RO | RO | - | - | - | - | - | - | - | - | - | RO | RW | RO | - | RO | - |
| D12.2 | Operator Competency Log | RO | - | RO | RO | - | - | - | - | - | - | - | - | - | RO | RW | RO | - | RO | - |
| D12.3 | Post-Delivery Support Tracker | RO | - | RW | RO | - | - | - | - | - | - | - | - | - | RO | RO | RO | - | RO | - |
| D12.4 | Final Operational Audit Report | RO | - | RO | RA | - | - | - | - | RA | - | - | - | - | RW | RO | RO | - | RO | - |
| D12.5 | Project Ledger Closure & Archival Record | - | - | RA | RO | - | - | RW | - | RO | - | - | - | - | RO | - | RO | - | RW | - |

---

## Centralized Marketing Hub (MDS)

| Tool ID | Tool Name | Client | OM | PM | LE | AE | LD | FO | CA | HE | PO | IO | WS | T | QA | LFE | LO | CR | IT/Admin | MKT |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MDS.1.1 | Content Feed Tool | RO | RO | RO | RO | RO | RO | - | - | RO | - | - | - | - | - | RO | RO | RO | RO | RW |
| MDS.1.2 | Asset Marketing Brief | RO | RO | RO | RO | RO | RO | - | - | RO | - | - | - | - | - | RO | RO | RO | RO | RW |
| MDS.1.3 | Visual Content Manifestation | RO | RO | RO | RO | RO | RO | - | - | RO | - | - | - | - | - | RO | RO | RO | RO | RW |
