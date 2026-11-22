---
name: sheet-colour-coding
description: Colour-code the uncoloured tool tabs of a workbook Google Sheet in the AGENT_USE Drive folder, using the project's colour rules. Use when asked to colour-code, colour, or predict colours for a workbook or its tabs (e.g. "colour-code workbook 5", "do the colours for D5.3").
---

# Sheet colour coding

1. Read `docs/SHEET_COLOUR_CODES/_.md` for what each colour means.
2. Follow `docs/SHEET_COLOUR_CODING/_.md` step by step. It covers the Drive folders, the scripts in `scripts/sheets/`, the request format and the report.
3. Load the `anthropic-skills:google-workspace` skill before the first Sheets edit, if it is available.

Edit the real workbook file and never create a test copy. End with the report the doc describes: the link, the tabs coloured and skipped, and the judgement calls to confirm.
