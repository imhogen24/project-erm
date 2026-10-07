# Workbook 04 (Team Assignment & Capacity Planning) — Tier 1 Workflow Guide

Unlocked once D2.14's advance payment clears. D4.8's sign-off freezes the project's official schedule and labor baseline — everything downstream is measured against it.

---

### D4.1 — Technical Requirement Notes

- **Why:** translate the contracted scope into concrete staffing and equipment needs.
- **App does:** pre-fills the contract link and target start date from D2.12/D2.14.
- **Staff does (PM):** lists engineering modules, required roles/skill levels, and effort days; lists software/equipment needed and whether it's available or needs procurement; signs.
- **Client does:** nothing.
- **Unlocks:** D4.2.

### D4.2 — Resource Request Form

- **Why:** request specific engineers and resolve scheduling conflicts before committing anyone.
- **App does:** pre-fills the budgeted labor total from D1.14.
- **Staff does (PM):** requests roles/engineers and the dates needed. (Head of Engineering): checks each requested engineer against other projects' schedules, approves or reassigns; signs.
- **Client does:** nothing.
- **Unlocks:** D4.3 — blocked until every role is filled and approved.

### D4.3 — Team Assignment & Provisioning Record

- **Why:** lock the official team roster — signing this is what actually creates the assignment records in the system.
- **App does:** on sign-off, creates the project's staff assignment records and sets the PM/lead engineer on the project.
- **Staff does (Head of Engineering):** finalizes the roster (who, role, days, phase involvement); lists what hardware/software/licenses each person needs; confirms everyone is in the capacity tracker; signs.
- **Client does:** nothing.
- **Unlocks:** D4.4.

### D4.4 — Access Confirmation Log

- **Why:** make sure every assigned engineer can actually get into the project's shared systems before kick-off.
- **App does:** on sign-off, marks each assignment as IT-provisioned — this is what unblocks the PM's kick-off button.
- **Staff does (Admin/IT):** works the access checklist (drive folder, CAD vault, comms channel, docs hub); confirms every engineer has verified access; signs.
- **Client does:** nothing.
- **Unlocks:** D4.5 — blocked until access is confirmed for everyone.

### D4.5 — Internal Kick-off Deck

- **Why:** build the briefing material so the team walks into kick-off already knowing the essentials.
- **App does:** nothing — this is a genuine authoring task.
- **Staff does (PM):** builds the deck; confirms it covers the five mandatory topics (client vision, hard scope boundaries, timeline, budget constraints, known risks — each sourced from a specific earlier document); signs.
- **Client does:** nothing.
- **Unlocks:** D4.6.

### D4.6 — Kick-off Calendar Invite & Agenda

- **Why:** schedule the internal kick-off meeting.
- **App does:** pre-fills the required attendee list from D4.3's roster.
- **Staff does (PM):** sets date/time/location; sends the invite (script provided); confirms it was sent and the room/platform booked.
- **Client does:** nothing — internal meeting.
- **Unlocks:** D4.7.

### D4.7 — Kick-off Meeting Minutes

- **Why:** run the kick-off and capture decisions and Day 1 tasks.
- **App does:** nothing — genuine note-taking task.
- **Staff does (PM):** runs the meeting; records attendance against the roster; logs discussion points and resolutions; assigns Day 1 action items with deadlines; confirms the team is clear on Phase 1; signs.
- **Client does:** nothing.
- **Unlocks:** D4.8, once the team is clear on Phase 1.

### D4.8 — Locked Project Baseline

- **Why:** freeze the schedule and labor allocation everything downstream measures against. Cannot be changed afterward without a formal change order.
- **App does:** pre-fills the approved budget from D1.14 and the engineer/role columns from D4.3; on sign-off, writes the project's official baseline start/end dates.
- **Staff does (PM):** sets the baseline start/end date and days per phase; adds the cost-impact buffer on top of D4.3's allocated days; confirms the baseline matches the contracted timeline; Head of Ops/Engineering signs.
- **Client does:** nothing.
- **Unlocks:** engineering execution — blocked if the baseline doesn't match the contract timeline.

```
D4.1 → D4.2 → D4.3 → D4.4 → D4.5 → D4.6 → D4.7 → D4.8
  → unlocks engineering execution
```

---

## Hard stops

| Step  | Condition | Effect |
|-------|-----------|--------|
| D4.2  | Not all roles filled and approved | D4.3 blocked. |
| D4.4  | Engineers haven't confirmed access | D4.5 blocked (and the PM kick-off button stays disabled). |
| D4.7  | Team not clear on Phase 1 | D4.8 blocked. |
| D4.8  | Baseline doesn't match the contract timeline | Sign-off blocked. |
