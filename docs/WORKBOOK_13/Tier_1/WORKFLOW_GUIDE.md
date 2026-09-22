# Workbook 13 (Marketing & Business Development) — Tier 1 Workflow Guide

Identical for both tiers — every tool in this workbook is tagged `tier: both`. Not part of the sequential QMS chain — it runs asynchronously after D12.4, only for projects marked suitable for marketing content, and doesn't gate any other workbook.

**Client consent is a hard prerequisite.** Nothing here proceeds without it.

---

### MDS.1.1 — Technical Marketing Content Feed

- **Why:** pull the technical highlights from a finished project into the marketing pipeline — and lock in the client's consent before anything else happens.
- **App does:** nothing auto beyond project name.
- **Staff does (Lead Engineer):** records client consent to publish; lists technical highlights with evidence links; lists available assets, marking each cleared for publish; signs.
- **Client does:** gives (or withholds) consent to use the project for marketing — recorded here.
- **Unlocks:** MDS.1.2/MDS.1.3 — entirely blocked if consent is false.

### MDS.1.2 — Asset Marketing Brief

- **Why:** define who this content is for, what it says, and where it goes.
- **App does:** nothing auto.
- **Staff does (Marketing Officer):** sets the target audience, key messages, and distribution channels with target publish dates; signs.
- **Client does:** nothing.
- **Unlocks:** MDS.1.3.

### MDS.1.3 — Visual Content Manifest

- **Why:** record what was actually produced and published, and where.
- **App does:** pre-fills project name.
- **Staff does (Marketing Officer):** logs each published item (title, format, channel, date, link, performance notes); signs.
- **Client does:** nothing.
- **Unlocks:** MDS.1.4.

### MDS.1.4 — Hub Synchronization & Confidentiality Sign-off

- **Why:** final check that nothing proprietary or client-confidential is about to go public, before it's published to the Marketing Hub.
- **App does:** on all-checks-passed sign-off, triggers the publish action to the Marketing Hub.
- **Staff does (PM):** works the confidentiality checklist (no proprietary dimensions/trade secrets, client logo usage approved, no IMHOGEN background IP exposed, assets watermarked/cropped per policy, consent form on file); confirms all pass; signs.
- **Client does:** nothing directly — their earlier consent is what's being verified here.
- **Unlocks:** publish to the Marketing Hub — blocked if any check fails, or per-item if a specific asset isn't cleared.

```
D12.4 complete + client consent → MDS.1.1 → MDS.1.2 → MDS.1.3 → MDS.1.4
  → publish to Marketing Hub (gates nothing further)
```

---

## Hard stops

| Step    | Condition | Effect |
|---------|-----------|--------|
| MDS.1.1 | Client consent to publish = false | MDS.1.2 and MDS.1.3 entirely blocked. |
| MDS.1.3 | A content item not cleared for publish | Publish blocked for that item. |
| MDS.1.4 | Any confidentiality check fails | Publish to the Marketing Hub blocked. |
