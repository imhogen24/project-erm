"""List every tab with its size and the fills it already uses.

Usage: uv run --with openpyxl python scripts/sheets/tabs.py <workbook.xlsx>
A tab with no fills is uncoloured and needs work.
"""
import collections
import sys

import openpyxl

from colours import READ, fill_key

wb = openpyxl.load_workbook(sys.argv[1])
for ws in wb.worksheets:
    rows, cols = ws.max_row, ws.max_column  # read before iterating, which can add cells
    counts = collections.Counter()
    for row in ws.iter_rows(min_row=8, max_row=rows, max_col=cols):
        for cell in row:
            key = fill_key(cell)
            if key:
                counts[READ.get(key, key)] += 1
    print(f"{ws.title!r:45} rows={rows:3} cols={cols:3}", dict(counts.most_common(8)))
