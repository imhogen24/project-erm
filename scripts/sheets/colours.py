"""Colour values shared by the sheet colour-coding scripts. See docs/SHEET_COLOUR_CODING/_.md."""

# Colour used when painting a cell.
HEX = {
    "GREY": "CCCCCC",
    "GREEN": "B6D7A8",
    "YELLOW": "FFE599",
    "PINK": "EA9999",
    "PURPLE": "B4A7D6",
    "ORANGE": "F9CB9C",
    "CYAN": "A2C4C9",
    "MAGENTA": "D5A6BD",
}

# Fills found in existing sheets, mapped back to a colour name when reading.
READ = {
    "FFCCCCCC": "GREY", "FFD9D9D9": "GREY", "FFEFEFEF": "GREY", "FFF3F3F3": "GREY",
    "FFB6D7A8": "GREEN", "FF93C47D": "GREEN", "FF6AA84F": "GREEN",
    "FFFFE599": "YELLOW",
    "FFEA9999": "PINK",
    "FFB4A7D6": "PURPLE",
    "FFF9CB9C": "ORANGE", "FFF6B26B": "ORANGE",
    "FFA2C4C9": "CYAN",
    "FFD5A6BD": "MAGENTA",
}
RED_BORDERS = ("FFFF0000", "FFE06666", "FFCC0000")
EMPTY = ("FFFFFFFF", "00000000")


def fill_key(cell):
    f = cell.fill
    if not f or f.fill_type != "solid":
        return None
    c = f.fgColor
    key = c.rgb if c.type == "rgb" else f"theme{c.theme}"
    return None if key in EMPTY else key


def find_tab(wb, name):
    """Match a tab by its full title or by its code, e.g. "D4.1" for "D4.1 Technical Requirement Note"."""
    if name in wb.sheetnames:
        return wb[name]
    hits = [t for t in wb.sheetnames if t.split(" ")[0] == name]
    if len(hits) != 1:
        raise SystemExit(f"tab {name!r}: found {hits or 'nothing'}. Tabs: {wb.sheetnames}")
    return wb[hits[0]]
