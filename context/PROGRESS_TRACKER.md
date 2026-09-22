# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- [e.g. Not started / In progress / Complete]

## Current Goal

- [What you are building right now]

## Completed

- Workflow guides now live per-tier, not per-workbook: every workbook
  folder (WB01–WB13) has a `Tier_1/` and `Tier_3/` subfolder, each with
  its own `WORKFLOW_GUIDE.md` (Why / App does / Staff does / Client does
  / Unlocks next per step). Replaces the earlier single-file-per-workbook
  layout. Done for all 13 workbooks:
  `docs/WORKBOOK_0{1..9}/Tier_{1,3}/WORKFLOW_GUIDE.md` and
  `docs/WORKBOOK_1{0,1,2,3}/Tier_{1,3}/WORKFLOW_GUIDE.md`.
  - WB01, WB02: went through a full "what's actually automatable" pass —
    App/Staff/Client lines reflect real auto-fill vs genuine manual work
    (webhook ingestion, system-sent email, signatures as approve actions,
    etc.), with open items flagged inline and here.
  - WB03–WB13: written faster, one pass, mostly a direct read of each
    schema's fields into App/Staff/Client — **have not** been through the
    same automation-trimming scrutiny as WB01/WB02. Expect some
    "Staff does" lines to overstate manual work the same way WB01's did
    before that pass (e.g. metadata dates/names that are really just
    system timestamps + logged-in user).
  - Where a workbook has no Tier 3 divergence (WB03, 07, 08, 09, 10, 11,
    12, 13 — every tool tagged `tier: both`), the Tier_1 and Tier_3 files
    are identical (copied via `sed` title swap, not separately authored).
  - WB05 is Tier 1 only (Tier 3 skips it entirely) — its Tier_3 file is a
    one-line pointer, not a walkthrough. WB05 is also summarized by
    phase group (P1–P5 + handover) rather than per-tool, since it's 25
    engineering worksheets with almost no auto-fill to distinguish.
  - WB13 doesn't gate any other workbook — it's an async, optional
    marketing step after project closure, gated only by client consent.

## In Progress

- None yet.

## Next Up

- Optional: run the WB01/WB02-style automation-trimming pass over
  WB03–WB13's "Staff does" lines, if the same rigor is wanted there.

## Open Questions

- D1.1 webhook auth: how does the inbound intake-form webhook (see next
  section) verify the request actually came from IMHOGEN's website
  (shared secret, signed payload, IP allowlist, etc.)? Not decided.
- D1.4 acknowledgement email content: one generic template, or one per
  form type (Product Development vs CAD Request, etc.)? Not decided.
- D2.11 (Pending Signature Contract): is "pending over 7 days" and the
  reminder calculated/sent by the app, or checked manually? Not decided.
- D2.12 (Executed Contract): if signing runs through DocuSign, should
  the executed PDF / audit certificate / completion event be pulled in
  via DocuSign's API (same pattern as the D1.1 webhook) instead of a
  human pasting links? Not decided.
- T3.D2.2a has the client sign within the tool itself, before the
  PM/Finance/Executive review chain (D2.3–D2.5) runs — unclear if
  that's intentional or if the client is meant to sign again later at
  D2.11 like Tier 1. Not stated in the docs.

## Architecture Decisions

- **Tier 3 runs D1.2 and D1.4 the same as Tier 1** (triage, then the
  system-sent acknowledgement). `docs/WORKBOOK_01/README.md` describes
  Tier 3 purely by exception — "replaces D1.3/D1.8/D1.15" and "skips
  D1.5–D1.7" — so anything it doesn't list as replaced or skipped is
  read as shared between both tracks. Applied when splitting
  `WORKFLOW_GUIDE.md` into two full, independent Tier 1 / Tier 3
  walkthroughs instead of one chain with inline Tier-3 notes.

- **D1.4 acknowledgement email is system-sent, not staff-sent.** The
  schema's `delivery_status` field (Delivered/Bounced/Pending) only makes
  sense as a value reported back by a transactional email provider, so
  the app sends the templated acknowledgement itself the moment D1.2's
  triage decision is "Proceed to D1.3" — no staff step. This is the same
  Notification System already described in `context/ARCHITECTURE.md`
  (email at gate events), applied to this step specifically. Staff only
  get involved on a bounce (fix contact email) or a substantive client
  reply (read and log it).

- **D1.1 intake is webhook-ingested, not app-hosted.** IMHOGEN's website
  hosts the public intake forms (Product Development, CAD Request, Process
  Development, Engineering Support/Consultancy, Others). This app does not
  render a public form; it exposes a webhook endpoint that receives the
  submission the instant it's made and creates the project record from it.
  D1.1 is therefore a read-only, auto-created log — staff never open it as
  a task. Their first real touchpoint is D1.2 (triage), whose checklist now
  also covers confirming attached files are legible, since D1.1 has no
  separate review step. Decided while reworking the Workbook 01 guide to
  cut manual re-entry of data the app already has. Needs a corresponding
  addition to `context/ARCHITECTURE.md` (a public, unauthenticated
  `app/api/` route) once the auth approach above is settled.

## Session Notes

- [Context needed to resume work in the next session]
