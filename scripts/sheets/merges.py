"""Show the merged ranges that touch the given rows of a tab.

Usage: uv run --with openpyxl python scripts/sheets/merges.py <workbook.xlsx> "<tab>|15,16,26" ...
A merged cell takes its colour from its top-left cell, so paint that cell only.
"""
import sys

import openpyxl

from colours import find_tab

wb = openpyxl.load_workbook(sys.argv[1])
for spec in sys.argv[2:]:
    title, rows = spec.split("|")
    ws = find_tab(wb, title)
    for r in (int(x) for x in rows.split(",")):
        hits = sorted(str(m) for m in ws.merged_cells.ranges if m.min_row <= r <= m.max_row)
        print(title, r, hits)
