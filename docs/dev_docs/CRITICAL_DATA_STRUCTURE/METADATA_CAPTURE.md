# Updated Meta Data Capture — Unified Table

| Field | Type | Purpose | Classification |
|---|---|---|---|
| id | UUID | Unique identifier for metadata record | System Core |
| project_id | UUID | Links record to project entity | System Core |
| project_request_id | String | Human-readable project tracking ID | System Core |
| tool_id | String | Identifies SOP tool (e.g., D1.3, D6.10) | System Core |
| tool_instance_id | UUID | Unique instance of tool execution | System Core |
| phase | Enum | Phase (1–13) of workflow | System Core |
| service_track | Enum | Tier_1 or Tier_3 workflow path | System Core |
| part_id | UUID | Link to part entity (if applicable) | Relational Bridge |
| ncr_id | UUID | Link to NCR entity (if applicable) | Relational Bridge |
| contract_id | UUID | Link to contract record | Relational Bridge |
| invoice_id | UUID | Link to invoice record | Relational Bridge |
| tool_status | Enum | Draft, Awaiting Review, Approved, Locked | Workflow Control |
| gate_status | Boolean | Indicates if tool is locked/unlocked | Workflow Control |
| dependency_tool_id | String | Required prior tool for activation | Workflow Control |
| dependency_met | Boolean | Confirms dependency is satisfied | Workflow Control |
| is_active | Boolean | Indicates current active tool | Workflow Control |
| iteration_count | Integer | Number of revisions executed | Workflow Control |
| created_by | UUID | Staff ID of creator | Audit & Accountability |
| checked_by | UUID | Staff ID of reviewer | Audit & Accountability |
| approved_by | UUID | Staff ID of approver | Audit & Accountability |
| created_at | Timestamp | Record creation timestamp | Audit & Accountability |
| completed_at | Timestamp | Record completion timestamp | Audit & Accountability |
| duration_sec | Integer | Time taken for execution | Audit & Accountability |
| digital_signature_hash | String | Cryptographic approval signature | Audit & Accountability |
| finance_unblocked | Boolean | Indicates finance clearance (D3.10) | System Logic Flags |
| cad_locked | Boolean | Indicates CAD lock status (D6.10) | System Logic Flags |
| baseline_locked | Boolean | Indicates baseline freeze (D4.8) | System Logic Flags |
| ncr_open_flag | Boolean | Flags open NCR blocking progression | System Logic Flags |
| change_request_flag | Boolean | Indicates active change request | System Logic Flags |
| requires_reapproval | Boolean | Forces reapproval after change | System Logic Flags |
| revision_reason | Text | Reason for modification | Change Control |
| change_description | Text | Description of change made | Change Control |
| impacted_tools | JSON | List of affected downstream tools | Change Control |
| rollback_required | Boolean | Indicates if rollback is needed | Change Control |
