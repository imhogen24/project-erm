# Single Source of Truth (SSOT) — Data Fields & System Behavior

## Core SSOT Fields

| SSOT Data Field | Originating Tool | Data Structure / Type | ERM System Behavior & Usage |
|---|---|---|---|
| Client Legal Entity | D1.1 Product Development Form | String | Inherited by D1.3, D1.8, D1.15, and explicitly injected into all Phase 2 Contracting documents. |
| Primary Contact Details | D1.1 Product Development Form | JSON Object `(Contact, Number, Email)` | Drives all automated system notifications. Contact headers are strictly enforced as contact and number for standard data parsing. |
| Project Registration ID | D1.3 Received Request Record | String (Alphanumeric) | Acts as the Primary Key (PK) in the database. Auto-populates the "Project Reg. ID" field in the Document Control block of every subsequent tool. |
| Project Title & Objective | D1.1 Product Development Form | String (Long Text) | Locks the high-level intent. Cascades into the D1.12 Feasibility Report and D1.15 Project Brief. |
| Technical Operands | D1.3 Received Request Record | Multi-dimensional Array | Stores the categorized inputs (Materials, Energy, Information, Living Things). Prevents operators from accidentally changing the baseline scope later in the workflow. |
| Commercial Baseline | D1.14 Scope & Budget Generation | JSON List & Float | Stores the Total Value, Advance Payment %, and specific milestone targets. Automatically mapped into D2.2 (Initial Draft Template) and all Phase 3 Finance Hub validations. |
| Assigned Personnel | D4.1 Capacity Planning | UUID (Foreign Key) | Links the Lead Engineer and PM profiles to the project. Auto-fills the "Prepared By" or "Checked By" signatures on subsequent execution sheets. |
| Physical Risk Factors | D1.11 Risk Assessment | Array of Objects | Tracks specific safety flags (e.g., Machine Jamming, Blade Wear). Carried forward into Phase 8 (Fabrication) and Phase 9 (QA) to ensure identified hazards are explicitly tested. |

---

## Phase 2 SSOT Injections

| SSOT Data Field | Originating Tool | ERM System Behavior (Phase 2) |
|---|---|---|
| Client Legal Entity | D1.3 Received Request | Injected into D2.2 (Clause 2.1). Replaces the `[Client Name]` variable in the D2.1 boilerplate. Cannot be altered in Phase 2. |
| Primary Client Signatory | D1.15 Project Brief | Injected into D2.2 (Clause 2.2). Provides the specific contact required for D2.11 (Final Execution). |
| Total Contract Value (GHS) | D1.15 Project Brief | Injected into D2.2 (Clause 2.3). The absolute master number for the contract. Replaces `[Total GHS]` in the D2.1 boilerplate. If a client negotiates a lower price, this must be logged via D2.9 (Negotiation) to trigger an official SSOT update. |
| Project Duration / Timeline | D1.15 Project Brief | Injected into D2.2 (Clause 2.4). Sets the legal timeline constraint (e.g., "40 Working Days"). The Project Manager verifies this during D2.3 (PM Review). |
| Payment Milestone 1 (Advance %) | D1.15 Project Brief | Injected into D2.2 (Clause 2.5). Populates the advance required to unblock Phase 3. Finance verifies this during D2.4 (Finance Review). |
| Payment Milestones 2 & 3 | D1.15 Project Brief | Injected into D2.2 (Clauses 2.6 & 2.7). Maps exactly to the QMS gates (e.g., "upon Fabrication Start" or "upon Final Handover"). |

---

## Phases 3–8 SSOT Fields

| SSOT Data Field | Originating Tool | Data Structure / Type | ERM System Behavior & Usage |
|---|---|---|---|
| Invoice ID & Clearance Status | D3.8 Reconciled Payment Log | Boolean & String (e.g., INV-001, TRUE) | Acts as the absolute financial gatekeeper. The TRUE status automatically populates D3.10 Phase Unblock Notice, physically unlocking the system for Phase 4 (Planning) or Phase 8 (Fabrication). |
| Official Project Roster | D4.3 Team Assignment & Provisioning | Array of Objects `(Role, Name, Allocated Time)` | This array restricts system access. It dynamically auto-populates the "Prepared By" and "Checked By" dropdown menus in all subsequent Phase 5, 6, 7, and 8 tools. Only engineers on this list can sign off on tasks. |
| Master Part Numbers (Model Decomposition) | P6 Master Model Decomposition (Phase 5) | Hierarchical Tree | Creates the unique IDs for every sub-assembly and component. This exact hierarchy cascades directly into the D7.1 Final CAD BOM and D8.1 Job Processing Sheet, preventing part-naming errors. |
| Final CAD Bill of Materials (BOM) | D7.1 Final CAD BOM | Array of Objects `(Part #, Spec, Qty, UOM)` | The absolute SSOT for physical building. This exact list auto-populates D7.3 Request For Quotation (RFQ), D7.5 Purchase Orders, and serves as the strict checklist for D7.6 Incoming Inspection. |
| Approved Vendor / Supplier ID | D7.4 Vendor Selection Matrix | String / UUID | Once a vendor is chosen, this ID locks. It automatically populates the D7.5 Purchase Order and sets the "Expected Origin" for the D7.6 Incoming Inspection Report. |
| Fabrication Routing Operations | D8.1 Job Processing Sheet | Array of Steps `(Operation, Machine, Operator)` | Dictates the exact sequence of manufacturing (e.g., 1. Cut, 2. Weld, 3. Grind). This array automatically generates the checklist for D8.4 Fabrication Routing Traveler and the inspection points for the D8.5 In-Process QC Log. |

---

## Phase 5 Engineering SSOT Fields

| SSOT Data Field | Originating Tool | Data Structure / Type | ERM System Behavior & Usage |
|---|---|---|---|
| Requirement ID (Req ID) | P1.0 Master Requirements Design | String (e.g., REQ-001) | Acts as the primary tracker for every single design constraint. This ID must auto-populate and link directly to Phase 6 (Detailing/CAD) to prove that every drawn part addresses a specific requirement, and Phase 9 (Testing) to verify the requirement was met. |
| Requirement Description | P1.0 Master Requirements Design | String (Text) | The explicit engineering rule (e.g., "Chassis must withstand 150kg"). Once locked in P1.0, this text becomes immutable read-only data in the D9.4 Function Test Report, ensuring testers are checking exactly what was designed. |
| Target Value / Constraint | P1.0 Master Requirements Design | String / Float | The absolute metric (e.g., "150 kg", "S235JR Steel"). This value is pushed to Phase 7 (Procurement). If "S235JR Steel" is the constraint, the Procurement Officer cannot accidentally order a lower-grade steel on the D7.5 Purchase Order. |
| Tolerance (Min/Max) | P1.0 Master Requirements Design | String / Float | The acceptable deviation (e.g., "+25kg / -0kg"). This is a critical SSOT for Phase 8 (Fabrication) and Phase 9 (QA). It automatically sets the pass/fail thresholds on the D8.5 In-Process QC Log. The QA Inspector only inputs the actual measured value; the ERM uses this SSOT tolerance to calculate Pass/Fail. |
| Verification Method | P1.0 Master Requirements Design | String (Dropdown: Analysis, Inspection, Demonstration) | Dictates how the requirement will be proven. This value automatically routes the requirement to the correct testing protocol in Phase 9. For example, a requirement tagged "Analysis (FEA)" will mandate an FEA report attachment before the phase can be closed. |
