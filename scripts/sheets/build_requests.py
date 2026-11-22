"""Turn a colour plan into Google Sheets batchUpdate requests.

Usage: python3 scripts/sheets/build_requests.py <plan.json> <out.json>

plan.json maps each tab's sheetId to its cells:
{
  "180695637": {
    "_tab": "D4.1",
    "GREY": "A9 A14",
    "GREEN": "A10 A11",
    "HEADER": {"15": "A B H N R"},
    "PINK": "E10 A16:A19",
    "YELLOW": "B16:B19 N16:N19"
  }
}
Cells are separated by spaces. "B16:N19" means every cell in that rectangle.
HEADER rows paint the listed cells green and draw the red box with black
dividers across columns A-Y. Keys starting with "_" are ignored.

out.json maps each sheetId to its list of requests. Send one or more tabs per
update_spreadsheet call. Vertical runs of the same colour are merged into one
request to keep calls small.
"""
import collections
import json
import re
import sys

from colours import HEX

HEADER_LAST_COL = 24  # columns A-X inclusive, as on the coloured tabs


def col_index(letters):
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def parse(ref):
    m = re.fullmatch(r"([A-Z]+)(\d+)", ref)
    if not m:
        sys.exit(f"bad cell reference: {ref}")
    return int(m[2]) - 1, col_index(m[1])


def expand(refs):
    for token in refs.split():
        if ":" in token:
            a, b = token.split(":")
            (r1, c1), (r2, c2) = parse(a), parse(b)
            for r in range(min(r1, r2), max(r1, r2) + 1):
                for c in range(min(c1, c2), max(c1, c2) + 1):
                    yield r, c
        else:
            yield parse(token)


def rgb(h):
    return {k: round(int(h[i:i + 2], 16) / 255, 3) for k, i in (("red", 0), ("green", 2), ("blue", 4))}


def build(sid, tab):
    cells = collections.defaultdict(set)
    header_rows = []
    for colour, value in tab.items():
        if colour.startswith("_"):
            continue
        if colour == "HEADER":
            for row, cols in value.items():
                cells["GREEN"].update(expand(" ".join(f"{c}{row}" for c in cols.split())))
                header_rows.append(int(row) - 1)
        elif colour in HEX:
            cells[colour].update(expand(value))
        else:
            sys.exit(f"{sid}: unknown colour {colour}")

    owner = {}
    for colour, cs in cells.items():
        for rc in cs:
            if rc in owner and owner[rc] != colour:
                sys.exit(f"{sid}: cell row {rc[0] + 1} col {rc[1] + 1} is both {owner[rc]} and {colour}")
            owner[rc] = colour

    reqs = []
    for colour, cs in cells.items():
        by_col = collections.defaultdict(list)
        for r, c in cs:
            by_col[c].append(r)
        for c, rs in sorted(by_col.items()):
            rs.sort()
            runs = [[rs[0], rs[0]]]
            for r in rs[1:]:
                if r == runs[-1][1] + 1:
                    runs[-1][1] = r
                else:
                    runs.append([r, r])
            for a, b in runs:
                reqs.append({"repeatCell": {
                    "range": {"sheetId": sid, "startRowIndex": a, "endRowIndex": b + 1,
                              "startColumnIndex": c, "endColumnIndex": c + 1},
                    "cell": {"userEnteredFormat": {"backgroundColor": rgb(HEX[colour])}},
                    "fields": "userEnteredFormat.backgroundColor"}})

    red = {"style": "SOLID_MEDIUM", "colorStyle": {"rgbColor": {"red": 1}}}
    black = {"style": "SOLID_MEDIUM", "colorStyle": {"rgbColor": {}}}
    for r in header_rows:
        reqs.append({"updateBorders": {
            "range": {"sheetId": sid, "startRowIndex": r, "endRowIndex": r + 1,
                      "startColumnIndex": 0, "endColumnIndex": HEADER_LAST_COL},
            "top": red, "bottom": red, "left": red, "right": red, "innerVertical": black}})
    return reqs


plan = json.load(open(sys.argv[1]))
out = {sid: build(int(sid), tab) for sid, tab in plan.items()}
json.dump(out, open(sys.argv[2], "w"))
for sid, reqs in out.items():
    name = plan[sid].get("_tab", "")
    print(f"{sid} {name:12} {len(reqs):3} requests {len(json.dumps(reqs, separators=(',', ':'))):6} bytes")
