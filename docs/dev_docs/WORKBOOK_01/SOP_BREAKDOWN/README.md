# IMHOGEN QMS — Process Activity Registry

**Machine-readable source:** `sop_process_activities.json`  
**Raw source (reference only):** `sop_breakdown.json`

This document maps every atomic activity in the 13-phase QMS to its owner, input documents, output documents, QC gate, and key risk. It is the process layer — complementary to the workbook schemas (which are the form layer).

## How to read

- **PID**: hierarchical process ID (workbook.process.activity)
- **Owner**: normalized role responsible for execution
- **docs_in / docs_out**: canonical tool IDs; `EXT:` prefix = external input (no ERM form)
- **Track**: `tier1` = heavy engineering only, `both` = shared path

---

## WB01 — Project Onboarding and Definition Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 1.1.1 | Receive automatic notification of a new client inquiry via website for… | onboarding_manager | EXT:client_inquiry | D1.2 | Verify the notification contains readable text and contact i… | Email filtering to spam; missed notifications. |
| 1.1.2 | Read the inquiry to perform a preliminary spam/relevance filter. | onboarding_manager | D1.2 | — | Ensure the request broadly aligns with IMHOGEN's engineering… | Wasting time on spam or out-of-scope solicitations. |
| 1.1.3 | Create a new project entry in the tracker and copy/paste all client de… | admin_support | D1.2 | D1.3 | Double-check that phone numbers and email addresses are copi… | Typos in contact info leading to lost leads. |
| 1.1.4 | Send standard acknowledgment email to the client stating the inquiry w… | onboarding_manager | D1.3 | D1.4 | Verify the client's name is spelled correctly in the templat… | Client feels ignored if acknowledgment is delayed. |
| 1.2.1 | Contact the client to propose 2-3 available time slots for a technical… | admin_support | D1.3 | D1.5 | Ensure proposed times fall within standard operating hours. | Scheduling conflicts causing delays. |
| 1.2.2 | Generate a calendar invite with a video conferencing link and a standa… | admin_support | D1.5 | D1.6 | Verify the video link works and the time zone is correct. | Technical difficulties joining the meeting. |
| 1.2.3 | Conduct the discovery meeting to extract exact technical needs, operat… | onboarding_manager | D1.6 | D1.7 | Ensure the client explicitly states their budget constraints… | Failing to ask critical constraint questions. |
| 1.2.4 | Clean up raw meeting notes and upload them into the central documentat… | client_relations | D1.7 | D1.8 | Ensure all technical jargon and constraints are accurately t… | Loss of critical technical details post-meeting. |
| 1.3.1 | Share the Needs Assessment Notes with the Engineering and R&D team for… | onboarding_manager | D1.8 | D1.9 | Confirm receipt of the document by the Engineering team. | Bottlenecks if the engineering team misses the notification. |
| 1.3.2 | Evaluate if the department has the required CAD software, tooling, and… | rd_coordinator | D1.8 | D1.10 | Cross-check required software (e.g., Inventor) against curre… | Committing to a project without the necessary software/skill… |
| 1.3.3 | Evaluate the request for regulatory, safety, and operational risks. | engineering_risk_&_safety_officer | D1.8 | D1.11 | Ensure all physical safety standards related to the request … | Accepting a project with severe liability risks. |
| 1.3.4 | Compile the Capability and Risk assessments into a final Go/No-Go Feas… | engineering_risk_officer | D1.10 | D1.12 | Final managerial review of the Go/No-Go recommendation. | Incorrect Go/No-Go decision based on flawed data. |
| 1.4.1 | If "Go", write out the exact technical deliverables (CAD models, BOMs,… | project_manager | D1.12 | D1.13 | Ensure deliverables are strictly defined to prevent scope cr… | Vague deliverables leading to client disputes later. |
| 1.4.2 | Estimate the required engineering man-hours, software usage time, and … | project_manager | D1.13 | D1.14 | Verify hourly rates match the current department standards. | Underpricing the engineering effort. |
| 1.4.3 | Combine the Scope of Work and Cost Estimation into the formal Project … | head_of_operations | D1.13 | D1.15 | Check formatting, spelling, and mathematical accuracy of the… | Presenting an unprofessional or mathematically incorrect bri… |
| 1.5.1 | Conduct a brief internal meeting to formally hand over the Project Bri… | onboarding_manager | D1.15 | D1.16 | Both parties must verbally agree that the scope is clear eno… | Legal drafting begins with misunderstood technical parameter… |
| 1.5.2 | Change the project status in the central database from "Onboarding" to… | admin_support | D1.16 | — | Verify the status change is reflected across all dashboards. | Tracking confusion if the system still shows "Onboarding". |
| 1.5.3 | Archive all onboarding raw documents (emails, initial notes) into the … | admin_support | — | — | Ensure all files are correctly named and tagged before archi… | Cluttered or lost historical files. |

## WB02 — Contract Tracking and Administration Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 2.1.1 | Receive the formal Project Brief & Draft Budget from the Onboarding ha… | head_of_operations | D1.15 | — | Ensure all technical deliverables and budget figures are exp… | Ambiguous inputs leading to poorly drafted contracts. |
| 2.1.2 | Access the central legal repository and download the appropriate stand… | admin_support | — | D2.1 | Verify the templates are the most currently approved version… | Using outdated legal templates with voided clauses. |
| 2.1.3 | Populate the selected templates with client details, scope of work, bu… | head_of_operations | D4.5 | D2.2 | Double-check client legal name, addresses, and monetary figu… | Typos in critical financial or legal identifying information… |
| 2.2.1 | Route the Initial Draft Contract to the Project Manager to verify that… | head_of_operations | D2.2 | D2.3 | PM must sign off that the timeline and technical deliverable… | Legal commitment to impossible engineering timelines. |
| 2.2.2 | Route the PM Reviewed Draft to the Finance Team to verify payment mile… | head_of_operations | D2.3 | D2.4 | Finance must verify the payment schedule aligns with cash fl… | Unfavorable payment terms that restrict project funding. |
| 2.2.3 | Submit the draft to the Legal Advisor (if applicable) for a final comp… | head_of_operations | D2.4 | D2.6 | Check for excessive liability, indemnification, or IP forfei… | Exposing IMHOGEN to severe legal or financial liabilities. |
| 2.3.1 | Draft a formal email and send the Internally Approved Draft to the cli… | client_relations | D2.6 | D6.1 | Ensure the email clearly states the deadline for their revie… | Open-ended reviews causing project scheduling delays. |
| 2.3.2 | Receive client feedback/redlines. If changes are requested, schedule a… | client_relations | D6.4 | D2.8 | Ensure relevant decision-makers (Head of Ops, PM) are invite… | Inability to resolve contract disputes via email alone. |
| 2.3.3 | Conduct the negotiation meeting, discuss disputed clauses, and agree o… | head_of_operations | D6.4 | D2.9 | Never agree to technical or financial changes without PM/Fin… | Verbal agreement to terms that violate department policies. |
| 2.3.4 | Update the contract document based on the agreed compromises and condu… | head_of_operations | D2.9 | D2.10 | Ensure no unintended clauses were altered during the redline… | Sneaky or accidental changes inserted into the final text. |
| 2.4.1 | Upload the Finalized Contract into the digital signature platform and … | admin_support | D2.10 | D2.11 | Verify the correct authorized signers for both IMHOGEN and t… | Contract sent to an unauthorized representative. |
| 2.4.2 | Dispatch the digital envelope to the client and monitor the platform f… | admin_support | D2.11 | D2.11 | Send automatic 48-hour reminders if the document remains uns… | Project stalling due to forgotten signatures. |
| 2.4.3 | Once signed by all parties, download the final document and its digita… | admin_support | D2.11 | D2.12 | Verify the audit certificate is attached to prove legal vali… | Inability to prove the signature's authenticity in a dispute… |
| 2.4.4 | Upload the Executed Contract into the central secure legal repository … | admin_support | D2.12 | D2.13 | Ensure strict access control (read-only) is applied to the f… | Unauthorized alteration or deletion of executed contracts. |
| 2.4.5 | Update the CRM/Project Tracker status to "Contract Executed" and trigg… | onboarding_manager | D2.13 | D2.14 | Confirm the Finance Team acknowledges the trigger to start b… | Failure to initiate invoicing after the contract is signed. |

## WB03 — Payment Scheduling and Fund Management Process.

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 3.1.1 | Receive the "Phase Initiation Notice" and the Executed Contract from t… | finance_officer | D2.14 | — | Confirm receipt of the fully executed contract before initia… | Setting up billing on an unfinalized or unsigned contract. |
| 3.1.2 | Read the contract's commercial terms to extract exact milestone descri… | finance_officer | D2.12 | D3.1 | Verify that the extracted milestones exactly match the contr… | Misinterpreting payment terms leading to incorrect billing s… |
| 3.1.3 | Create a new client profile and project ledger in the accounting syste… | finance_officer | D3.1 | D3.2 | Finance Manager must perform a spot-check on the entered sch… | Data entry errors causing missed or incorrect future invoice… |
| 3.2.1 | Receive formal notification and proof of completion for a specific pro… | finance_officer | D3.3 | D3.3 | Verify the PM's proof of completion aligns with the contract… | Billing a client before the engineering value has actually b… |
| 3.2.2 | Generate a draft invoice in the accounting software corresponding to t… | finance_officer | D3.2 | D3.4 | Ensure PO numbers, tax IDs, and bank details are clearly vis… | Invoices rejected by the client's accounts payable due to mi… |
| 3.2.3 | Review and approve the draft invoice for mathematical accuracy and tax… | finance_officer | D3.4 | D3.5 | Dual-authorization required for invoices exceeding a predefi… | Sending mathematically incorrect invoices that damage compan… |
| 3.2.4 | Draft a formal email, attach the Approved Invoice (PDF format), and tr… | finance_officer | D3.5 | D3.6 | Verify the email address is the official accounts payable co… | Invoice sitting unread in the wrong person's inbox. |
| 3.3.1 | Log into the corporate banking portal daily to monitor and download re… | finance_officer | — | D3.7 | Ensure secure network connections and VPNs are used when acc… | Unnoticed funds leading to unnecessary project delays. |
| 3.3.2 | Cross-reference incoming bank deposits against outstanding invoices in… | finance_officer | D3.7 | D3.8 | Match the exact deposited amount and payment reference numbe… | Misallocating funds to the wrong client or project ledger. |
| 3.3.3 | Generate a formal Payment Receipt and email it to the client to acknow… | finance_officer | D3.8 | D3.9 | Issue the receipt within 24 hours of the funds clearing the … | Client disputes or uncertainty regarding their account stand… |
| 3.3.4 | Change the invoice status to "Paid" and send a "Payment Cleared - Proc… | finance_officer | D3.8 | D3.10 | PM must acknowledge the unblock notice before deploying engi… | Engineering team remaining idle because they are unaware fun… |
| 3.4.1 | Generate an Accounts Receivable (AR) aging report weekly to identify i… | finance_officer | D3.2 | D3.11 | Ensure the report accurately reflects the net terms (e.g., N… | Accumulation of bad debt and severe cash flow bottlenecks. |
| 3.4.2 | Send a polite, standardized follow-up email to clients with overdue in… | finance_officer | D3.11 | D3.9 | Maintain a professional tone to preserve the client relation… | Damaging client relations with aggressive or premature colle… |
| 3.4.3 | If payment is delayed beyond critical thresholds, issue a formal "Stop… | finance_officer | D3.11 | — | Escalate to Head of Business Operations before halting major… | Continuing to burn man-hours and resources on a defaulting c… |

## WB04 — Team Assignment and Capacity Planning Process.

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 4.1.1 | Receive the "Phase Initiation Notice" and the finalized Project Brief … | project_manager | D2.14 | — | Verify the Project Brief contains explicitly approved timeli… | Initiating planning based on unapproved or draft requirement… |
| 4.1.2 | Read the Project Brief to list the specific technical competencies, so… | project_manager | D1.15 | D4.1 | Ensure all required niche skills or specialized software mod… | Realizing midway through the project that the team lacks a c… |
| 4.1.3 | Populate the standard Resource Request Form with the required roles, h… | project_manager | D4.1 | D4.2 | Double-check that the requested man-hours align with the app… | Requesting more man-hours than the project budget can afford… |
| 4.2.1 | Receive the Resource Request Form and open the department's scheduling… | hr_manager | D4.2 | — | Ensure no single engineer is assigned a sustained workload e… | Staff burnout, missed deadlines, and poor quality output due… |
| 4.2.2 | Cross-reference the requested competencies with the skills matrix of a… | lead_engineer | D4.2 | — | Match the complexity of the project with the seniority level… | Assigning a junior engineer to a high-risk, complex system d… |
| 4.2.3 | Select the specific personnel for the project and formally log their a… | hr_manager | D4.2 | D4.3 | Verify that planned leave or PTO does not conflict with crit… | Key personnel going on vacation during a critical design dea… |
| 4.3.1 | Receive the Team Assignment Record and trigger the IT/Admin provisioni… | it_admin | D4.3 | EXT:it_provisioning_ticket | Ensure only the individuals listed on the Assignment Record … | Providing confidential client data access to unauthorized pe… |
| 4.3.2 | Create dedicated project folders in the central Document Management Sy… | it_admin | EXT:it_provisioning_ticket | — | Apply standardized naming conventions to all newly created d… | Chaotic file storage leading to lost CAD models or overwritt… |
| 4.3.3 | Set up dedicated internal communication channels (e.g., specific chat … | it_admin | EXT:it_provisioning_ticket | D4.4 | Ensure the Project Manager is granted "Admin" rights over th… | Fragmented communication happening outside the official proj… |
| 4.4.1 | Draft a structured kick-off presentation summarizing the client's goal… | project_manager | D4.3 | D4.5 | Ensure all proprietary client details are masked if the pres… | Team members lacking a holistic understanding of the project… |
| 4.4.2 | Send a calendar invite for the internal kick-off meeting to the assign… | admin_support | D4.5 | D1.6 | Verify that the scheduled time works for all assigned critic… | Key technical experts missing the foundational alignment mee… |
| 4.4.3 | Conduct the video/in-person kick-off meeting, explicitly outlining the… | project_manager | D4.5 | D4.7 | Require verbal confirmation from the Lead Engineer that the … | The technical team leaving the meeting with misaligned expec… |
| 4.4.4 | Log into the Project Tracking Software, formally lock the baseline sch… | project_manager | D4.7 | D4.8 | Ensure the baseline matches the kick-off agreements exactly;… | Unapproved changes creeping into the schedule after the kick… |

## WB05 — Standard Engineering Design Process (P1 - P6 Framework) — Tier 1 only

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 5.1.1 | Establish rough factors for all life phases (technology, operators, in… | lead_engineer | P0.0 | P1.1 | Verify all input/output operands match the Project Brief con… | Missing a critical operational environment constraint early … |
| 5.1.2 | Quantify requirements, assign tolerances, and allocate properties acro… | lead_engineer | P1.1 | P1.0 | Validate tolerances against available standard workshop capa… | Over-tolerancing leading to unmanufacturable or costly desig… |
| 5.1.3 | Compile, review, and lock the formal, multi-dimensional design specifi… | lead_engineer | P1.0 | P1.0 | Formal sign-off on the Pr-Set before any design work begins. | Proceeding to conceptual design with ambiguous or conflictin… |
| 5.2.1 | Analyze the technical process viewpoints, assess difficulty, and assig… | lead_engineer | P1.0 | D4.1 | Ensure assigned engineers have the required technical compet… | Assigning complex datum calculations to junior staff. |
| 5.2.2 | Estimate design costs, map the schedule, and set up phase progress tra… | project_manager | D4.1 | P2.0 | Baseline schedule must align with overall project budget and… | Underestimating required man-hours for complex FEA or CAD mo… |
| 5.3.1 | Establish the operands (Material, Energy, Information) and the technol… | lead_engineer | P1.0 | P3.1 | Verify logical flow: all input operands must logically conve… | Incomplete transformation mapping leading to missing mechani… |
| 5.3.2 | Distribute effects between technical/human systems, defining main, ass… | lead_engineer | P3.1 | P3.3 | Ensure no critical load-bearing or safety function is overlo… | Functional black-boxes left unresolved before structural syn… |
| 5.4.1 | Populate the morphological matrix with action principles and combine f… | lead_engineer | P3.3 | P4.1 | Ensure at least 3 distinct conceptual variants are generated… | Fixation on a single design path without exploring optimal a… |
| 5.4.2 | Establish spatial topologies (Iconic/Principle) and evaluate proposals… | lead_engineer | P4.1 | P4.2-FINAL | Justify the selected organ structure mathematically against … | Selecting a suboptimal layout due to bias rather than techni… |
| 5.5.1 | Establish preliminary layouts, rough forms, and define constructional … | lead_engineer | P4.2-FINAL | P5a.1i | Clash detection and clearance check at the preliminary layou… | Components interfering spatially during assembly. |
| 5.5.2 | Definitively establish dimensions, material treatments, part decomposi… | lead_engineer | P5a.1i | P5.4 | Tolerance stack-up analysis and FEA validation against the P… | Structural failure or excessive deflection under operational… |
| 5.6.1 | Generate individual detailed manufacturing drawings, control assembly … | cad_engineer | P5.4 | D6.5.2 | Drawing checker review (Title blocks, GD&T, notes) by Lead E… | Releasing incomplete or inaccurate drawings to the fabricati… |
| 5.6.2 | Prepare manufacturing instructions, conduct a final design audit, and … | lead_engineer | D6.5.2 | D6.8 | Complete sign-off matrix verification prior to manufacturing… | Manufacturing unapproved or obsolete file versions. |

## WB06 — Client Review and Approval Process.

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 6.1.1 | Receive the "Approved Technical Data Package" (CAD, Drawings, BOM, Rep… | project_manager | D6.8 | — | Verify all files possess the required internal QA/QC signatu… | Submitting unverified or draft engineering files to the clie… |
| 6.1.2 | Upload the deliverables into a secure, client-facing digital portal or… | admin_support | D6.8 | EXT:client_delivery_link | Ensure access permissions are strictly limited to the author… | Unauthorized interception of proprietary IMHOGEN designs. |
| 6.1.3 | Draft and send a calendar invite for a formal "Deliverable Presentatio… | client_relations | EXT:client_delivery_link | D2.8 | Schedule the meeting within 48 hours of sending the delivera… | Client reviewing complex technical files without proper cont… |
| 6.1.4 | Conduct the presentation meeting, using 3D viewers to explain technica… | project_manager | D6.8 | D6.3 | Ensure the Lead Engineer explains why certain design constra… | Client rejecting a design because they do not understand the… |
| 6.2.1 | Send the standardized "Client Feedback Form" to the client immediately… | client_relations | D6.3 | D6.4 | Formally state the deadline (e.g., 5 business days) for subm… | Open-ended feedback timelines stalling the project indefinit… |
| 6.2.2 | Receive the completed feedback form from the client and extract all re… | admin_support | D6.4 | D6.5 | Ensure every single client comment is captured line-by-line … | Losing or ignoring a specific client request, leading to dis… |
| 6.3.1 | Review the Master Revision Log against the original signed Contract/Pr… | project_manager | D6.5 | D6.6 | "Major" changes (out of scope) must immediately trigger a fi… | Performing out-of-scope engineering redesigns for free (Scop… |
| 6.3.2 | Route approved "Minor" revisions back to the engineering team, assigni… | project_manager | D6.6 | D6.7 | Ensure the revision tickets explicitly link back to the spec… | Engineers misunderstanding the requested change and altering… |
| 6.3.3 | Execute the requested changes in the CAD models and update the associa… | lead_engineer | D6.7 | D6.8 | Save the revised files as a new version (e.g., V1.1) to pres… | Overwriting the original design files and losing previous wo… |
| 6.3.4 | Perform a QA/QC check on the revised files to ensure the specific feed… | qa_officer | D6.8 | D6.9 | Verify that the new changes still comply with the original P… | A minor revision inadvertently causing a critical structural… |
| 6.4.1 | Generate the formal "Delivery & Acceptance Form" stating that all desi… | head_of_operations | D6.9 | D6.10 | Cross-check the final deliverable list on the form against t… | Missing a contracted deliverable on the final acceptance she… |
| 6.4.2 | Upload the Acceptance Form and the Final Revised Technical Data Packag… | admin_support | D6.10 | D2.11 | Verify the digital envelope is sent to the client's authoriz… | Obtaining a sign-off from an unauthorized client representat… |
| 6.4.3 | Conduct a brief final Handover Meeting (if requested by the client) to… | project_manager | D6.8 | D6.11 | Confirm verbally during the meeting that no further engineer… | Client attempting to request more changes after the handover… |
| 6.4.4 | Receive the executed e-signature, archive all final documents, and tri… | admin_support | D6.10 | D6.11 | Ensure all finalized CAD models are locked in the PDM vault … | Accidental alterations to the finalized, client-approved eng… |

## WB07 — Procurement Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 7.1.1 | Receive the "Project Phase Closure Notice" and the finalized, QA-appro… | procurement_officer | D6.8 | — | Verify the BOM has the formal "Released for Manufacturing" d… | Procuring materials based on an obsolete or unapproved draft… |
| 7.1.2 | Import the digital BOM into the procurement dashboard and categorize i… | procurement_officer | D7.1 | D7.2 | Ensure units of measure (e.g., mm, meters, kg) are correctly… | Unit conversion errors leading to massive over/under orderin… |
| 7.2.1 | Cross-reference the Categorized Procurement List against the locked fi… | procurement_officer | D7.2 | D3.11 | Flag any item where the current market price exceeds the est… | Material price fluctuations destroying the project's profit … |
| 7.2.2 | Generate a Request for Quotation (RFQ) for required materials, specify… | procurement_officer | D7.2 | D7.3 | Ensure RFQs for standard structural steel clearly state acce… | Vendors quoting for sub-standard or incorrect material grade… |
| 7.2.3 | Dispatch RFQs to approved local suppliers (e.g., Suame/Kumasi market v… | admin_support | D7.3 | D7.3 | Verify vendor email addresses and set a strict deadline (e.g… | Project delays due to endlessly waiting on vendor quotes. |
| 7.2.4 | Receive quotes, compile a comparative vendor matrix (price, lead time,… | procurement_officer | EXT:vendor_quotes | D7.4 | Justify selection if the cheapest vendor is not chosen (e.g.… | Selecting an unreliable vendor solely because they offered t… |
| 7.3.1 | Generate formal Purchase Orders (POs) in the accounting system for the… | procurement_officer | D7.4 | D7.5 | Double-check payment terms, delivery address, and required d… | Materials shipped to the wrong address or on the wrong timel… |
| 7.3.2 | Route the Draft PO to the Finance Manager for final financial authoriz… | procurement_officer | D7.5 | D7.5 | Finance Manager must verify that sufficient cash flow exists… | Issuing POs without the capital to pay the vendor, damaging … |
| 7.3.3 | Transmit the Approved PO to the vendor and obtain a formal acknowledgm… | admin_support | D7.5 | EXT:vendor_acknowledgment | Do not mark the item as "Ordered" until the vendor explicitl… | Assuming an order is placed when the vendor never actually s… |
| 7.4.1 | Receive the physical delivery at the workshop. Cross-reference the ven… | admin_support | D7.5 | D7.6 | Verify physical box counts and part numbers before the deliv… | Signing for missing boxes and losing leverage to claim missi… |
| 7.4.2 | Perform incoming Quality Control (QC) on the raw materials using measu… | qa_officer | D7.1 | D7.6 | Mandate a dimensional and visual check for warping, rust, or… | Accepting sub-standard, out-of-tolerance steel that will rui… |
| 7.4.3 | If materials pass QC, formally log them into the digital inventory sys… | procurement_officer | D7.6 | D7.7 | Apply physical project tags/labels to the materials to preve… | Usable project materials being cannibalized by other worksho… |
| 7.4.4 | Trigger a notification to the Fabrication Supervisor that all required… | procurement_officer | D7.7 | D8.1 | Supervisor must acknowledge the notice to trigger the Fabric… | Fabrication team sitting idle while materials gather dust in… |

## WB08 — Fabrication and Construction Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 8.1.1 | Receive the "Fabrication Readiness Notice", Final BOM, and 2D Engineer… | workshop_supervisor | D8.1 | — | Ensure all 2D drawings have the correct "Released for Manufa… | Fabricating from obsolete or unapproved drawing versions. |
| 8.1.2 | Review the 2D drawings and BOM to sequence the manufacturing operation… | workshop_supervisor | — | D8.1 | Verify that the sequence logically prevents impossible tool-… | Assembling components out of order, blocking access for fina… |
| 8.1.3 | Identify, reserve, and calibrate all required workshop machinery, CNC … | workshop_supervisor | D8.1 | D8.2 | QA/QC must verify that measuring tapes, calipers, and gauges… | Dimensional errors caused by using uncalibrated or worn-out … |
| 8.2.1 | Conduct a mandatory "Toolbox Talk" to brief the shop floor team on the… | workshop_supervisor | D8.1 | D4.6 | Require machine operators and fabricators to verbally confir… | Floor workers misunderstanding the drawing symbols or safety… |
| 8.2.2 | Issue the necessary Personal Protective Equipment (PPE) tailored to th… | workshop_supervisor | D4.6 | D8.3 | Deny workshop floor access to any operator lacking complete,… | Severe workplace injuries due to lack of appropriate process… |
| 8.3.1 | Perform initial shaping, cutting, or blanking of raw materials to the … | workshop_supervisor | — | — | Verify the dimensions of the first piece before processing t… | Wasting expensive raw materials due to an incorrect initial … |
| 8.3.2 | Deburr, chamfer, and clean the edges/surfaces of all prepped materials… | workshop_supervisor | — | — | Visually inspect surfaces to ensure no burrs, oil, or scale … | Poor joint integrity or machine tool damage caused by contam… |
| 8.4.1 | Load the prepped materials into the designated fixtures, jigs, or mach… | workshop_supervisor | — | — | Ensure all locating pins and clamps are fully seated before … | Manufacturing a skewed part because the material was not ful… |
| 8.4.2 | Execute preliminary forming, temporary fastening, or rough machining p… | workshop_supervisor | — | — | QA/QC must perform a quick squareness and dimensional check … | Discovering a dimensional error after the entire assembly is… |
| 8.4.3 | Execute the final manufacturing sequence (e.g., final joining, structu… | workshop_supervisor | — | — | Strictly enforce the defined process sequence to mitigate me… | Severe structural distortion (warping) rendering the assembl… |
| 8.5.1 | Perform visual, dimensional, and (if required) Non-Destructive Testing… | qa_officer | — | D8.5 | Flag any defective joint or out-of-tolerance surface for imm… | Micro-fractures or weak connections failing under operationa… |
| 8.5.2 | Execute final finishing operations (e.g., grinding flush, polishing, e… | workshop_supervisor | D8.5 | — | Ensure finishing operations do not reduce material thickness… | Weakening the structural integrity or altering critical tole… |
| 8.6.1 | Apply standard environmental protections (e.g., primer, paint, anodizi… | workshop_supervisor | — | — | Ensure coatings are applied evenly and do not obstruct any t… | Premature degradation or coating interference with dynamic m… |
| 8.6.2 | Move the Coated Final Product to the designated testing staging area a… | workshop_supervisor | — | D8.6 | Supervisor must digitally sign off that all fabrication step… | Handing over an unfinished, unchecked physical unit to the f… |

## WB09 — Quality Control and Testing Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 9.1.1 | Receive the "Fabrication Completion Notice" and physically transfer th… | qa_officer | D8.6 | — | Ensure the structure is securely staged and safe to inspect … | Handling damage occurring during transfer to the QA area. |
| 9.1.2 | Retrieve the locked Design Specification (Pr-Set), 2D Drawings, and th… | qa_officer | — | D9.1 | Verify that the retrieved drawings are the exact versions us… | Inspecting a physical part against an outdated or incorrect … |
| 9.2.1 | Perform a comprehensive visual sweep of the structure, checking for sh… | qa_officer | D9.1 | D9.2 | Flag any exposed, uncoated raw steel that violates the envir… | Premature corrosion or operator injury due to missed burrs/s… |
| 9.2.2 | Measure all critical datums, hole centers, and overall bounding dimens… | qa_officer | — | D9.3 | Ensure measuring tools are zeroed and calibrated before taki… | Falsely passing an out-of-tolerance dimension due to an unca… |
| 9.3.1 | Prepare the structure for physical testing by securely anchoring it an… | qa_officer | D9.1 | — | Ensure all anchors are tight before applying any dynamic or … | Structure tipping or collapsing during the load test, causin… |
| 9.3.2 | Actuate all moving parts, clamps, and mechanisms to verify smooth oper… | qa_officer | P1.0 | D9.4 | Verify that the structure returns to absolute zero (no perma… | Plastic deformation indicating a fundamental structural desi… |
| 9.4.1 | If any dimension or test fails, immediately tag the physical structure… | qa_officer | D9.3 | D9.5 | The NCR must cite the specific drawing coordinate or Pr-Set … | Ambiguous defect reporting leading to the wrong area being r… |
| 9.4.2 | Route the NCR back to the Fabrication Supervisor and Lead Engineer to … | lead_engineer | D9.5 | D9.6 | Do not authorize a "repair" if the structural integrity has … | Attempting to weld over a critical failure, hiding a fatal f… |
| 9.5.1 | Once all tests pass (or rework is successfully re-tested), compile all… | qa_officer | D9.4 | D9.7 | The Lead Engineer must countersign the QA Certificate to acc… | Releasing a product solely on a technician's signature witho… |
| 9.5.2 | Attach the physical QA Release Certificate to the structure and update… | admin_support | D9.7 | D9.8 | Ensure the Finance Team is copied on the notice to prepare t… | Product sitting in the staging area indefinitely because the… |

## WB10 — Engineering Documentation and Archiving Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 10.1.1 | Receive the "Final QA Release Certificate" and interview the Fabricati… | lead_engineer | D9.7 | D10.1 | Ensure every authorized rework or dimensional shift is captu… | "As-built" physical product not matching the final delivered… |
| 10.1.2 | Update the 3D CAD models, 2D Drawings, and BOM to reflect the exact "A… | cad_engineer | D10.1 | D10.1 | Increment the file revision number (e.g., Rev A to Rev B) to… | Overwriting original design intent data without a traceable … |
| 10.2.1 | Draft the User Manual, detailing safe operational procedures, ergonomi… | client_relations | P1.0 | D10.2 | Ensure the manual addresses all Human System constraints def… | Client operators injuring themselves due to unclear usage in… |
| 10.2.2 | Draft the Maintenance & Adjustment Guide, specifying lubrication point… | client_relations | D9.1 | D10.2 | Include specific tolerance limits (e.g., maximum wear limits… | Premature equipment failure due to lack of defined preventat… |
| 10.3.1 | Compile the As-Built Drawings, BOM, User Manual, Maintenance Guide, an… | admin_support | D10.2 | D10.3 | Verify that the document title blocks, page numbers, and IMH… | Delivering a disorganized, unprofessional stack of unlinked … |
| 10.3.2 | Route the compiled Final TDP to the Project Manager and Lead Engineer … | admin_support | D10.3 | D10.3 | Both the PM and Lead Engineer must digitally sign the master… | Releasing unverified instructional documents containing tech… |
| 10.4.1 | Move all finalized native CAD files, FEA simulation data, and internal… | it_admin | — | — | Apply strict "Read-Only" permissions to the archived folder … | Accidental deletion or unauthorized alteration of closed pro… |
| 10.4.2 | Change the state of all associated CAD files within the PDM software t… | lead_engineer | D10.1 | D10.4 | Verify that the PDM system registers the lock and severs che… | Engineers accidentally opening and modifying archived CAD fi… |
| 10.5.1 | Conduct a brief project post-mortem to extract key technical lessons, … | rd_coordinator | — | D10.5 | Strip all confidential client IP from CAD assemblies before … | Violating client NDAs by reusing proprietary geometries in f… |
| 10.5.2 | Update the central tracking system status to "Documentation Complete" … | project_manager | D10.3 | D10.6 | Confirm the Client Relations Team has acknowledged receipt o… | The physical product is ready, but delivery stalls because t… |

## WB11 — Product / Process Delivery Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 11.1.1 | Receive the "Delivery & Handover Notice" and coordinate a delivery dat… | client_relations | D10.6 | D9.8 | Confirm the client has the necessary lifting equipment (e.g.… | Delivery vehicle arriving at a site unequipped to unload the… |
| 11.1.2 | Secure an appropriate transport vehicle (e.g., standard pickup or flat… | admin_support | D10.3 | D11.1 | Verify the vehicle payload capacity exceeds the final As-Bui… | Transport vehicle failure or legal violations due to overloa… |
| 11.2.1 | Prepare the physical structure for transport by securing any movable c… | workshop_supervisor | D9.8 | — | Ensure ratchet straps do not apply crushing force to delicat… | Irreversible dimensional damage or scratching of precision s… |
| 11.2.2 | Print physical copies of the Approved Client TDP (User Manual, Mainten… | admin_support | D10.3 | EXT:physical_packet | Verify all pages are printed clearly and bound professionall… | Client receiving damaged, unreadable, or missing operational… |
| 11.3.1 | Arrive at the client site, supervise the safe unloading of the equipme… | project_manager | D11.1 | — | Ensure the equipment is placed on a stable, level surface as… | Equipment instability due to placement on an uneven or unpre… |
| 11.3.2 | Perform a post-transit visual inspection and basic leveling/alignment … | qa_officer | D9.4 | D11.2 | Re-verify the primary datum plane squareness before handing … | Handing over equipment that was subtly warped or knocked out… |
| 11.4.1 | Conduct a physical walkthrough with the client's operators, demonstrat… | client_relations | EXT:physical_packet_manual | — | Force the client operators to physically perform the loading… | Operators nodding in agreement but failing to actually under… |
| 11.4.2 | Present the formal "Final Handover Certificate" to the client's author… | project_manager | D11.4 | D11.4 | Ensure the signatory is a legally authorized client represen… | Disputed project closure because the wrong person signed the… |
| 11.5.1 | Return the Signed Handover Certificate to the office, scan it, and upl… | admin_support | D11.4 | D11.4 | Ensure the scan is high-resolution and the signatures are cl… | Loss of the physical paper leaving the company with no proof… |
| 11.5.2 | Trigger a "Project Delivered" notification to the Finance Team to imme… | project_manager | D11.4 | D11.5 | Finance must issue the final invoice within 24 hours of rece… | Delayed revenue collection causing unnecessary cash flow str… |

## WB12 — Training and Post-Delivery Support Process

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 12.1.1 | Receive the "Digitized Handover Record" and contact the client to sche… | client_relations | D11.4 | D11.3 | Ensure the scheduled training aligns with the shift patterns… | Training the wrong personnel, leaving actual machine operato… |
| 12.1.2 | Extract the "Safe Handling and Operation" guidelines from the User Man… | client_relations | D10.3 | D12.1 | Verify the syllabus directly addresses all Human System cons… | Omitting critical safety or ergonomic warnings during traini… |
| 12.2.1 | Conduct on-site, hands-on training with the client's operators, demons… | client_relations | D12.1 | — | Force each operator to independently perform a full operatio… | Operators passively watching but failing to grasp the tactil… |
| 12.2.2 | Administer a brief verbal or practical competency check and have all t… | client_relations | D12.1 | D11.3 | Only grant certification to operators who successfully compl… | Unqualified operators damaging the equipment or injuring the… |
| 12.3.1 | Activate the formal 7 to 30-day "Post-Delivery Support" window in the … | admin_support | D11.4 | D12.3 | Set automated system alerts for the expiration date of the s… | Providing indefinite free support due to a lack of formal bo… |
| 12.3.2 | Receive, log, and route any client feedback, minor adjustments, or ope… | client_relations | D12.3 | D12.3 | Categorize requests strictly: verify if the issue is a genui… | Executing out-of-scope engineering changes under the guise o… |
| 12.4.1 | Schedule and conduct a final operational audit near the end of the sup… | qa_officer | D12.3 | D12.4 | Cross-reference operator feedback against the original "Wish… | Assuming the equipment is functioning perfectly just because… |
| 12.5.1 | Formally close the active support ticket and notify the client that st… | client_relations | D12.4 | D12.3 | Offer a long-term preventative maintenance contract to the c… | Losing an opportunity for recurring revenue via maintenance … |
| 12.5.2 | Conduct a final sweep to ensure all logs (training, audit, support) ar… | admin_support | — | D12.5 | Verify the Finance Team confirms the final invoice has been … | Closing a project ledger when outstanding debt remains uncol… |

## WB13 — Marketing and Business Development

| PID | Activity | Owner | docs_in | docs_out | QC Gate | Risk |
|---|---|---|---|---|---|---|
| 13.1.1 | Identify project innovations and document client input vs IMHOGEN outp… | lead_engineer | D10.5 | MDS.1.1 | Every content entry must be tied to a valid Project Request … | Releasing proprietary client data or unverified claims witho… |
| 13.1.2 | Document the process story milestones with plain-language descriptions… | lead_engineer | D8.5, D9.4 | MDS.1.1 | Each milestone must reference at least one QMS quality proof… | Process story without evidence reduces credibility of market… |
| 13.1.3 | Map distribution channels and define call-to-action links ensuring eve… | lead_engineer | MDS.1.1 | MDS.1.1 | All channels must include the mandatory inquiry link before … | Content distributed without CTA breaks the QMS lead-generati… |
| 13.1.4 | R&D Lead certifies technical accuracy and client confidentiality clear… | lead_engineer | MDS.1.1 | MDS.1.1 | Both R&D Lead signature and Marketing Hub acknowledgment mus… | Unsigned content transmitted to marketing creates liability … |
| 13.2.1 | Define campaign theme and key message translating engineering outputs … | marketing_hub | MDS.1.1 | MDS.1.2 | Campaign theme must reflect IMHOGEN engineering identity and… | Vague or off-brand campaign theme produces content that misr… |
| 13.2.2 | List technical features with client-facing benefit statements and sour… | lead_engineer | MDS.1.1, D1.8, D9.4 | MDS.1.2 | Every technical claim must cite a source document before the… | Unverified technical claims in marketing copy create reputat… |
| 13.2.3 | Specify mandatory CTA link, button text, and hub creative instructions… | marketing_hub | MDS.1.2 | MDS.1.2 | Mandatory inquiry link must be present in every asset before… | Assets without CTA break the lead-generation loop and waste … |
| 13.3.1 | Catalogue all image assets with asset name, type, file path, and view … | cad_engineer | D6.8, D8.6 | MDS.1.3 | All image assets must have a confirmed file link before bein… | Broken or missing file links block campaign production. |
| 13.3.2 | Log all video and motion assets with duration, file path, and marketin… | cad_engineer | D9.4 | MDS.1.3 | No video asset may be released without a confirmed file link… | Unverified video assets may contain safety violations or exp… |
| 13.3.3 | Conduct brand compliance check: verify IMHOGEN watermark is applied an… | marketing_hub | MDS.1.3 | MDS.1.3 | Watermark confirmed and zero safety violations present befor… | Unmarked or non-compliant assets published externally damage… |
| 13.3.4 | R&D Lead authorizes visual assets for public distribution and records … | lead_engineer | MDS.1.3 | MDS.1.3 | R&D Lead signature and date must be recorded in the manifest… | Unauthorized asset distribution exposes confidential client … |
| 13.4.1 | Marketing hub compiles all approved MDS documents into a campaign pack… | marketing_hub | MDS.1.1, MDS.1.2, MDS.1.3 | MDS.1.4 | All three MDS documents must be in approved state before hub… | Publishing an incomplete campaign package damages profession… |
| 13.4.2 | PM reviews the final campaign package and provides confidentiality cle… | project_manager | MDS.1.4 | MDS.1.4 | PM must confirm no proprietary client information is present… | Client confidentiality breach through marketing content crea… |

---

## Role Glossary

| Normalized key | Human-readable |
|---|---|
| `admin_support` | Admin Support |
| `cad_engineer` | CAD Engineer / Draftsman |
| `client_relations` | Client Relations / Client Experience Manager |
| `engineering_risk_&_safety_officer` | engineering_risk_&_safety_officer |
| `engineering_risk_officer` | engineering_risk_officer |
| `engineering_team` | Engineering Team (Assigned Engineers) |
| `finance_officer` | Finance Officer / Finance Manager |
| `head_of_operations` | Head of Business Operations |
| `hr_manager` | HR Manager |
| `it_admin` | IT Admin |
| `lead_engineer` | Lead Engineer / Systems Engineer |
| `legal_advisor` | Legal Advisor |
| `logistics_officer` | Logistics Officer |
| `marketing_hub` | Marketing Hub |
| `onboarding_manager` | Project Onboarding Manager |
| `procurement_officer` | Procurement Officer |
| `project_manager` | Project Manager |
| `qa_officer` | QA/QC Officer |
| `rd_coordinator` | R&D Coordinator |
| `workshop_supervisor` | Workshop / Fabrication Supervisor |

---

## Operator category key

| Value | Meaning for the app |
|---|---|
| `human_system` | Requires manual human action; cannot be auto-completed |
| `information_system` | Data entry / system state change; potentially automatable |
| `management_system` | Approval / decision gate; requires role-gated sign-off |
| `technical_system` | Hands-on technical execution (CAD, fabrication, testing) |
