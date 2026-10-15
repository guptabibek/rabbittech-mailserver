#!/usr/bin/env python3
"""Builds data/web/fonts/rabbittech-icons-outlined.woff2, the icon font webmail uses.

It is Google's Material Icons Outlined (Apache-2.0, npm package material-icons@1.13.12,
iconfont/material-icons-outlined.woff2) with two names added. SOGo writes its icons as
ligatures ("inbox", "delete", ...) for the filled Material Icons font; the outlined font has
every one of them except label_outline and lock_outline, whose outlined icons are simply
"label" and "lock". Without these two the words would show as text.

Usage: python3 scripts/build-webmail-icons.py material-icons-outlined.woff2 data/web/fonts/rabbittech-icons-outlined.woff2
Needs fonttools and brotli (pip install fonttools brotli).
"""
import sys

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

ALIASES = {'label_outline': 'label', 'lock_outline': 'lock'}

font = TTFont(sys.argv[1])
glyph = font.getBestCmap()


def glyphs(name):
    return [glyph[ord(c)] for c in name]


def ligature_subst():
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            if table.LookupType == 7:  # extension
                table = table.ExtSubTable
            if table.LookupType == 4:
                yield table


subst = list(ligature_subst())
for alias, target in ALIASES.items():
    first, *rest = glyphs(target)
    icon = next(lig.LigGlyph for table in subst for lig in table.ligatures.get(first, [])
                if lig.Component == rest)
    first, *rest = glyphs(alias)
    table = next(t for t in subst if first in t.ligatures)
    if any(lig.Component == rest for lig in table.ligatures[first]):
        continue
    lig = otTables.Ligature()
    lig.Component = rest
    lig.CompCount = len(rest) + 1
    lig.LigGlyph = icon
    # The longest match must come first, or "label" would win over "label_outline"
    table.ligatures[first].append(lig)
    table.ligatures[first].sort(key=lambda l: -len(l.Component))

font.flavor = 'woff2'
font.save(sys.argv[2])
print('wrote', sys.argv[2])
