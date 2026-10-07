# Workbook 01(Onboarding) — Tier 1 Workflow Guide (Heavy Engineering)

High-level walkthrough of onboarding: what the app does, what staff do,
what the client does, and what unlocks next. Full 16-step path.


---

### D1.1 — Web Forms

- **Why:** capture the raw inquiry as the starting record.
- **App does:** a webhook fires when the client submits on IMHOGEN's
  website; the app creates the project record, generates the Project
  Request ID, logs the submission and files, and routes to Tier 1.
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
- **Unlocks:** "Proceed" opens D1.3. "Reject as Spam" is a hard stop.

### D1.3 — Received Request Record

- **Why:** translate the client's request into engineering terms — what
  goes in and out of the system.
- **App does:** pre-fills client and project details from D1.1; provides
  the operand/operator tables.
- **Staff does:** fills the operand table (4 rows: input/output) and
  operator table (5 rows: description); lists missing information to
  clarify at the discovery meeting.
- **Client does:** nothing directly.
- **Unlocks:** D1.4.

### D1.4 — Acknowledgement Email

- **Why:** confirm receipt to the client.
- **App does:** sends a templated email automatically once D1.2 passes
  triage; tracks delivery status.
- **Staff does:** nothing on the happy path; fixes the contact email on
  a bounce, reads and logs a substantive reply.
- **Client does:** receives it; we will decide later if this should be
  a noreply sort of message.
- **Unlocks:** D1.5.

### D1.5 — Meeting Time Proposal

- **Why:** agree a date/time for the discovery meeting.
- **App does:** proposes slots and records the agreed time.
- **Staff does:** proposes the time-slot options; confirms the agreed
  date, time, platform, and meeting link.
- **Client does:** picks a slot, confirms attendance.
- **Unlocks:** D1.6.

### D1.6 — Calendar Invite & Agenda

- **Why:** lock down meeting logistics and the agenda.
- **App does:** pre-fills the confirmed meeting details; provides the
  fixed agenda.
- **Staff does:** fills the attendee lists; works through the agenda
  checklist; completes the pre-meeting checklist.
- **Client does:** nothing at this step.
- **Unlocks:** D1.7.

### D1.7 — Raw Meeting Notes

- **Why:** capture what was said in the discovery meeting.
- **App does:** provides a note-taking template structured around the
  agenda.
- **Staff does:** writes notes per agenda topic; logs parking-lot items;
  records the outcome and next steps.
- **Client does:** attends and participates in the meeting.
- **Unlocks:** D1.8.

### D1.8 — Needs Assessment Notes

- **Why:** convert meeting notes into confirmed engineering constraints
  and a first design spec.
- **App does:** pre-fills references from D1.7/D1.3; provides the
  constraint and spec tables.
- **Staff does (Lead Engineer):** fills confirmed constraints/remarks
  for each operand and operator row; drafts the design-spec table
  (Fixed/Wish); signs.
- **Client does:** nothing.
- **Unlocks:** D1.9, once signed off.

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
  recommendation.
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
- **Client does:** nothing yet — this feeds D1.15.
- **Unlocks:** D1.14.

### D1.14 — Cost Estimation Sheet

- **Why:** build the internal cost and the client-facing budget.
- **App does:** pre-fills deliverables from D1.13; provides the
  labour/cost/markup tables.
- **Staff does:** breaks down labour and direct costs; applies markup;
  allocates the budget per deliverable; answers the overhead question;
  signs.
- **Client does:** nothing.
- **Unlocks:** D1.15, if minimum overhead is met (else Finance review).

### D1.15 — Project Brief & Draft Budget

- **Why:** get the client to formally accept scope, timeline, and budget.
- **App does:** auto-assembles the brief from D1.3/D1.13/D1.14; publishes
  it to the client portal.
- **Staff does:** adds the primary objectives and payment schedule;
  signs; shares the brief with the client.
- **Client does:** reviews and accepts, or comments.
- **Unlocks:** D1.16 — the key client-acceptance gate.

### D1.16 — Handoff Meeting Minutes

- **Why:** formally hand the project from onboarding to contracting.
- **App does:** pre-fills project value/terms from D1.15; provides the
  handoff checklist.
- **Staff does:** fills the handoff details, links the brief, writes the
  scope summary, lists contracting directives, completes the handoff
  checklist; signs.
- **Client does:** nothing.
- **Unlocks:** Workbook 02 (Contracting), on sign-off.

```
D1.1 → D1.2 → D1.3 → D1.4 → D1.5 → D1.6 → D1.7 → D1.8 → D1.9
  → D1.10 → D1.11 → D1.12 → D1.13 → D1.14 → D1.15 → D1.16
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
