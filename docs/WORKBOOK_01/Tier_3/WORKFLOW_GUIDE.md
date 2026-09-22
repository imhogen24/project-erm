# Workbook 01(Onboarding) — Tier 3 Workflow Guide (Drafting & Reverse Engineering)

High-level walkthrough of onboarding: what the app does, what staff do,
what the client does, and what unlocks next. The shorter "Green Lane":
swaps D1.3, D1.8, and D1.15 for Tier-3-specific tools, and skips the
discovery-meeting steps (D1.5–D1.7) entirely, since the client sends
assets directly instead of meeting.


---

### D1.1 — Web Forms

- **Why:** capture the raw inquiry as the starting record.
- **App does:** a webhook fires when the client submits on IMHOGEN's
  website; the app creates the project record, generates the Project
  Request ID, logs the submission and files, and routes to Tier 3.
- **Staff does:** nothing — this is a read-only log the app creates
  itself.
- **Client does:** fills and submits the form on IMHOGEN's website.
- **Unlocks:** D1.2, automatically.

### D1.2 — Initial Inquiry Notification

- **Why:** filter out spam or off-topic inquiries before anyone invests
  time.
- **App does:** shows the logged inquiry and records the triage decision.
- **Staff does:** runs the triage checklist (readable and attachments
  legible, aligns with services, contact info valid), then picks the
  decision.
- **Client does:** nothing.
- **Unlocks:** "Proceed" opens T3.D1.3a. "Reject as Spam" is a hard stop.

### T3.D1.3a — T3 Technical Intake

- **Why:** assess what the client provided and define the drafting
  output required.
- **App does:** provides the source-asset and drafting-spec tables.
- **Staff does:** logs each source asset; defines the drafting
  requirements; answers the data-sufficiency questions.
- **Client does:** provides the source assets (part, model, or
  drawings).
- **Unlocks:** D1.4.

### D1.4 — Acknowledgement Email

- **Why:** confirm receipt to the client.
- **App does:** sends a templated email automatically once D1.2 passes
  triage; tracks delivery status.
- **Staff does:** nothing on the happy path; fixes the contact email on
  a bounce, reads and logs a substantive reply.
- **Client does:** receives it; may reply.
- **Unlocks:** T3.D1.8a.

### T3.D1.8a — T3 Physical Metrology Log

- **Why:** capture measurements and photos of the client's part.
  Replaces D1.8; no discovery meeting needed first.
- **App does:** provides the equipment/dimension/photo tables.
- **Staff does:** logs the measurement tools and measured features;
  completes the photo checklist; signs.
- **Client does:** provides access to the part.
- **Unlocks:** D1.9.

### D1.9 — Internal Review Request

- **Why:** kick off the internal feasibility review.
- **App does:** pre-fills project details; tracks reviewer assignments.
- **Staff does:** assigns a reviewer and focus question per review
  category; tracks status; signs once all reviews are in.
- **Client does:** nothing.
- **Unlocks:** D1.10.

### D1.10 — Capability Assessment Sheet

- **Why:** decide whether IMHOGEN can actually deliver the project.
- **App does:** pre-fills project details; provides the capability
  checklist.
- **Staff does:** works the technical and commercial checklists; sets
  the Capability status; notes the bottleneck; signs.
- **Client does:** nothing.
- **Unlocks:** "Capable"/"Partially Capable" opens D1.11. "Not Capable"
  is a hard stop.

### D1.11 — Risk Assessment Sheet

- **Why:** identify risks and make a Go/No-Go call.
- **App does:** pre-fills capability status; provides the risk register.
- **Staff does:** logs each risk (category, description, probability,
  impact, mitigation, owner); sets the risk profile and the Go/No-Go
  decision; signs.
- **Client does:** nothing.
- **Unlocks:** "Go"/"Conditional Go" opens D1.12. "No-Go" is a hard stop.

### D1.12 — Feasibility Report

- **Why:** roll up capability, risk, and commercial findings into one
  recommendation. Runs as a fast-track check on this path.
- **App does:** pre-fills prior findings; provides the summary tables.
- **Staff does:** summarises capability by domain; lists top risks and
  mitigations; compares timeline and budget; writes the recommendation;
  signs.
- **Client does:** nothing.
- **Unlocks:** D1.13.

### D1.13 — Draft Scope of Work

- **Why:** define what's in and out of scope, plus the phased timeline.
- **App does:** pre-fills project details; provides the scope and
  timeline tables.
- **Staff does:** writes the project vision; lists included/excluded
  deliverables; builds the phased timeline; lists client
  responsibilities; signs.
- **Client does:** nothing yet — this feeds T3.D1.15a.
- **Unlocks:** D1.14.

### D1.14 — Cost Estimation Sheet

- **Why:** build the internal cost and the client-facing budget.
- **App does:** pre-fills deliverables from D1.13; provides the
  labour/cost/markup tables.
- **Staff does:** breaks down labour and direct costs; applies markup;
  allocates the budget per deliverable; answers the overhead question;
  signs.
- **Client does:** nothing.
- **Unlocks:** T3.D1.15a, if minimum overhead is met (else Finance
  review).

### T3.D1.15a — T3 Drafting SOW & Quote

- **Why:** give the client scope and a fixed quote. Replaces D1.15.
- **App does:** provides the deliverables/pricing tables and fixed
  exclusions list.
- **Staff does:** lists the service items; builds the pricing breakdown.
- **Client does:** reviews and accepts.
- **Unlocks:** D1.16.

### D1.16 — Handoff Meeting Minutes

- **Why:** formally hand the project from onboarding to contracting.
- **App does:** pre-fills project value/terms from T3.D1.15a; provides
  the handoff checklist.
- **Staff does:** fills the handoff details, links the brief, writes the
  scope summary, lists contracting directives, completes the handoff
  checklist; signs.
- **Client does:** nothing.
- **Unlocks:** Workbook 02 (Contracting), on sign-off.

```
D1.1 → D1.2 → T3.D1.3a → D1.4 → T3.D1.8a → D1.9
  → D1.10 → D1.11 → D1.12 → D1.13 → D1.14 → T3.D1.15a → D1.16
  → unlocks Workbook 02
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D1.2  | Triage = "Reject as Spam" | Project `Rejected`; nothing unlocks. |
| D1.10 | Capability = "Not Capable" | Next step blocked. |
| D1.11 | Decision = "No-Go" | Next step blocked; PM closes the project. |
| D1.14 | Minimum overhead not met | Next step blocked pending Finance. |
