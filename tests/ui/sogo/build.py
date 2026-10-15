#!/usr/bin/env python3
"""Builds the webmail mock pages: frame.html + pages/<name>.body.html, with optional
<name>.run.js (Angular run block), <name>.vendor.html (scripts before Common.js) and
<name>.after.html (scripts after Common.js). Usage: build.py <output root>"""
import pathlib
import sys

here = pathlib.Path(__file__).parent
root = pathlib.Path(sys.argv[1])
frame = (here / 'frame.html').read_text()
modules = {'calendar': 'Calendar', 'contacts': 'Contacts', 'prefs': 'Preferences'}


def part(name, suffix):
    path = here / 'pages' / (name + suffix)
    return path.read_text() if path.exists() else ''


for body in sorted((here / 'pages').glob('*.body.html')):
    name = body.name.split('.')[0]
    html = (frame.replace('{BODY}', body.read_text())
                 .replace('{MODULE}', modules.get(name, 'Mail'))
                 .replace('{RUN}', part(name, '.run.js'))
                 .replace('{EXTRA_VENDOR}', part(name, '.vendor.html'))
                 .replace('{EXTRA_AFTER}', part(name, '.after.html')))
    (root / (name + '.html')).write_text(html)
