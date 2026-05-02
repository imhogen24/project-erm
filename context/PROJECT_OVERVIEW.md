# Project ERM

## Overview

IMHOGEN ERM is a bespoke Engineering Resource Management application for IMHOGEN LTD, a Ghanaian engineering firm. It digitises and enforces the company's 13-phase Quality Management System (QMS), replacing a Google Sheets-based workflow. It manages engineering projects from initial client inquiry through to post-delivery warranty closure across two service tracks: **Tier 1** (Heavy Engineering — full 13 phases) and **Tier 3** (Drafting & Reverse Engineering — shortened ~7 phases).

The system is built around a sequential "Fill-Review-Lock" gate engine: no phase can begin until the previous one is formally PM-approved and locked.

## Goals

1. Replace Google Sheets QMS with a reliable, enforced digital system
2. Enforce sequential gate locking so no phase starts without prior PM sign-off
3. Establish a single point of truth for all project data via relational database
4. Automate data inheritance so no field is typed twice across workbooks
5. Create forensic, immutable audit trails for every gate sign-off
6. Enable cross-project intelligence (e.g. aggregate material needs across all active projects)
7. Provide a client portal for real-time project visibility and digital sign-offs
8. Protect IMHOGEN's proprietary QMS methodology from competitors

## Core User Flow

1. Client submits an inquiry via public intake form (no login required)
2. System routes inquiry to Tier 1 or Tier 3 based on inquiry type; generates unique Project Request ID
3. PM receives request, reviews feasibility, and initiates onboarding
4. Process Owners fill tools in sequence (WB01 → WB13), each locked until the previous is PM-approved
5. Fill-Review-Lock cycle repeats: Process Owner fills tool → submits → PM reviews → approves/rejects → tool locks, next tool unlocks
6. Client is notified at key gates and provides digital sign-off (e.g. CAD Lock at D6.10)
7. Hard stops block progression if prerequisites are unmet (e.g. no fabrication without cleared advance payment)
8. Project closes via final documentation (WB10), product delivery (WB11), post-delivery support (WB12), and marketing archiving (WB13)

## Features

### Gate Engine
Sequential locking and unlocking of tools based on PM approval status. Enforces the 13-phase QMS order. Includes Change Request Protocol with downstream re-locking and technical tolerance checks against the project budget and timeline baseline.

### Dynamic Form Renderer
Schema-driven form rendering from `tool_definitions` records (JSONB). Supports 50+ distinct tool layouts without hardcoded forms. Handles repeating rows, conditional tools, and tier-specific variants.

### Auto-Populate Engine
Inherited fields (Client Name, Project ID, Budget, Contract Value) automatically pre-fill downstream tools from upstream master data. Zero manual duplication across the 13 workbooks.

### Client Portal
Secure interface for clients to track project progress, view approved Technical Data Packages (TDPs), leave contextual comments on deliverables, and provide digital signatures at key gates.

### Role-Based Access Control (RBAC)
14 roles (Admin, Project Manager, Lead Engineer, CAD Engineer, Finance Officer, Operator/Tech, Client, and others) with scoped read/write/approve permissions per module and action.

### Workbook Modules (WB01–WB13)
13 workbook modules covering the full project lifecycle: Onboarding (WB01), Contract Tracking (WB02), Payment Scheduling (WB03), Team Assignment (WB04), Engineering Design (WB05), Client Review (WB06), Procurement (WB07), Fabrication (WB08), Quality Control (WB09), Documentation (WB10), Product Delivery (WB11), Post-Delivery Support (WB12), and Marketing (WB13).

### Dashboards & Reporting
PM overview of all active projects, current phases, and next required actions. Finance dashboard for outstanding invoices and payment milestones. NCR quality report with severity breakdown. Cross-project materials aggregation. Staff utilisation and workload view.

### File Storage & TDP Management
File assets (CAD files, TDP PDFs, metrology photos, compliance documents) are stored via the `lib/storage/` abstraction layer. The current provider is UploadThing; the design allows migration to AWS S3 or Vercel Blob without any application-level rewrites — only the provider wiring in `lib/storage/` changes. CAD vault locking (D10.4) sets CAD files to read-only after final sign-off.

### Notification System
In-app and email notifications triggered at gate events: tool assignment, gate reached, NCR raised, and payment cleared.

### NCR Management
Non-Conformance Report workflow (D9.5/D9.6) with auto-generated NCR numbers and blocking logic that prevents progression until each NCR is formally resolved.

## Scope

### In Scope

- Full digitisation of the 13-phase QMS for both Tier 1 and Tier 3 service tracks
- All 13 workbook modules (WB01–WB13) with their gate logic and hard stops
- Public client intake form and authenticated client portal
- PM orchestration workflow and process owner task queues
- RBAC for all 14 defined roles
- File storage for CAD files, TDPs, metrology photos, and compliance documents
- Payment milestone tracking and finance gate enforcement
- NCR creation, tracking, and resolution workflow
- Cross-project dashboards and reporting
- In-app and email notification system
- Offline resilience: debounced auto-save and local storage caching

### Out Of Scope

- CAD software or drawing creation (ERM manages approvals of CAD outputs, not their production)
- Native mobile application (web-responsive interface only)
- Integration with external accounting or ERP systems
- Vendor/supplier-facing portals
- Automated procurement or purchase order dispatch to vendors
- AI/ML features or predictive analytics

## Success Criteria

- All 13 QMS phases are enforced sequentially with no bypass paths
- Zero manual field re-entry: auto-populate correctly inherits master data into all downstream tools
- Every gate sign-off is recorded in an immutable audit trail
- PM can view all active projects, their current phase, and next required action from a single dashboard
- Client can track progress and download approved TDPs without staff involvement
- All hard stops (advance payment, CAD lock, NCR resolution) are enforced and cannot be bypassed
- Tier 1 and Tier 3 tracks route correctly from the D1.1 intake form onward
- System remains functional and auto-saves during internet outages
