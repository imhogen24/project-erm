# Workbook 05 (Standard Engineering Design) — Tier 1 Workflow Guide

**Tier 1 only — Tier 3 skips this workbook entirely** (see `Tier_3/WORKFLOW_GUIDE.md`).

Unlocked once D4.8 (Locked Project Baseline) is signed off. This is pure engineering design work — 25 individual worksheets grouped into 5 phases (P1–P5) plus a handover tool, following a systematic design methodology (Pahl & Beitz). Unlike WB01–04, almost nothing here is auto-fillable beyond metadata — the content *is* the engineering. Diagrams and CAD artifacts are stored as links to the CAD vault / Drive, not uploaded into the app.

This guide groups the 25 tools by phase rather than listing each individually — field-level detail lives in the schema and `README.md`.

---

### P1 — Requirements *(P1.0)*

- **Why:** consolidate every engineering requirement into one register before any design work starts.
- **App does:** nothing auto.
- **Staff does:** builds the requirements table (ID, description, category, target value, tolerance, verification method); Lead Engineer signs.
- **Client does:** nothing.
- **Unlocks:** P2 — blocked if requirements aren't marked complete.

### P2 — Planning *(Pr2.1, P2.0)*

- **Why:** turn the requirements into a task-level execution plan with days, assignees, and deliverables.
- **App does:** pre-fills total engineering days, labor budget, and project dates from D4.8.
- **Staff does:** builds the Gantt chart (in an external tool — this just stores the link) and the master task list (task ID, assignee, complexity, duration, deliverable, status); Lead Engineer signs.
- **Client does:** nothing.
- **Unlocks:** P3 — blocked until all tasks are defined.

### P3 — Conceptual Design *(P3.1, P3.1a, P3.1b, P3.2, P3.2a, P3.3)*

- **Why:** define the black-box transformation (what goes in and out of the system) and break it into a function structure, comparing variants.
- **App does:** nothing auto.
- **Staff does:** engineers diagram the transformation process and function structure, including alternate variants (A/B), and consolidate into a final representation.
- **Client does:** nothing.
- **Unlocks:** P4.

### P4 — Organ Structure *(P4.1A–D, P4.2A–D)*

- **Why:** generate and compare working-principle concepts, synthesize them, lay out the physical topology, and choose the final concept with a documented reason.
- **App does:** nothing auto.
- **Staff does:** fills the morphological matrices, synthesizes concepts, lays out topology diagrams (stored as links to the CAD vault), and at P4.2D writes the selection rationale for the chosen concept.
- **Client does:** nothing.
- **Unlocks:** P5 — blocked if the P4.2D selection rationale is left empty.

### P5 — Constructional Design *(P5a.1i/ii, P5.2, P5.3, P5.3.1, P5.4, P5.4.1)*

- **Why:** turn the chosen concept into an actual buildable construction, down to individual part definitions.
- **App does:** nothing auto.
- **Staff does:** builds constructional requirements, then works through conception → elaboration → preliminary layout → definitive structure → part-level definition (material, CAD filename, manufacturing notes, failure modes), each with a diagram/file link.
- **Client does:** nothing.
- **Unlocks:** D6.5.2.

### D6.5.2 — Master Model Decomposition

- **Why:** produce the final hierarchical BOM with the iProperty data CAD needs, and hand design off to Workbook 06.
- **App does:** on sign-off, sets the project status to "WB06 Active."
- **Staff does:** builds the 5-level BOM hierarchy with iProperty data per part; Lead Engineer and Head of Engineering both sign.
- **Client does:** nothing.
- **Unlocks:** Workbook 06 (CAD and Design Engineering) — blocked if the decomposition isn't marked complete.

```
P1.0 → Pr2.1 → P2.0 → [P3 phase] → [P4 phase] → [P5 phase] → D6.5.2
  → unlocks Workbook 06
```

---

## Hard stops

| Step   | Condition | Effect |
|--------|-----------|--------|
| P1.0   | Requirements not complete | P2.0 blocked. |
| P2.0   | Not all tasks defined | P3.1 blocked. |
| P4.2D  | Selection rationale empty | Sign-off blocked. |
| D6.5.2 | Decomposition not complete | Workbook 06 unlock blocked. |
