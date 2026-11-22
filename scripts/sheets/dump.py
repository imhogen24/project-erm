"""Print every non-empty cell of the given tabs with its fill, red border and strike-through.

Usage: uv run --with openpyxl python scripts/sheets/dump.py <workbook.xlsx> "<tab>" ["<tab>" ...]
Output per cell: A10[GREEN]'Client Name'. Tags: +REDBORDER, +STRIKE (whole cell struck through),
"-" means no fill. Struck-through parts of a cell are shown as ~~note~~.
Rows 1-6 are the shared page header and are skipped.
"""
import sys

import openpyxl
from openpyxl.cell.rich_text import CellRichText, TextBlock

from colours import READ, RED_BORDERS, fill_key, find_tab


def text(value):
    if isinstance(value, CellRichText):
        return "".join(
            f"~~{part.text}~~" if isinstance(part, TextBlock) and part.font.strike else str(part)
            for part in value
        )
    return str(value)


wb = openpyxl.load_workbook(sys.argv[1], rich_text=True)
for title in sys.argv[2:]:
    ws = find_tab(wb, title)
    print("=====", title)
    rows, cols = ws.max_row, ws.max_column
    for row in ws.iter_rows(min_row=7, max_row=rows, max_col=cols):
        out = []
        for c in row:
            key = fill_key(c)
            colour = READ.get(key, key) if key else None
            if c.value is None and colour is None:
                continue
            tag = colour or "-"
            sides = (getattr(c.border, s) for s in ("top", "bottom", "left", "right"))
            if any(s is not None and s.color is not None and getattr(s.color, "rgb", "") in RED_BORDERS for s in sides):
                tag += "+REDBORDER"
            if c.font and c.font.strike:
                tag += "+STRIKE"
            value = "" if c.value is None else repr(text(c.value))
            out.append(f"{c.coordinate}[{tag}]{value}")
        if out:
            print(" | ".join(out))
