#!/usr/bin/env python3
"""Generate the matching activity-bar SVG and status-bar WOFF (requires fontTools)."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = Path(__file__).resolve().parents[1]
# Shared lighthouse silhouette: roof, lamp with a window, beams, striped tower, base.
CONTOURS = [
    [(8, 5.5), (12, 2.5), (16, 5.5)],
    [(8, 6), (16, 6), (16, 11), (8, 11)],
    [(10, 7.5), (10, 9.5), (14, 9.5), (14, 7.5)],
    [(2, 5), (7, 7), (7, 10), (2, 12)],
    [(17, 7), (22, 5), (22, 12), (17, 10)],
    [(9.5, 12), (14.5, 12), (16, 21), (8, 21)],
    [(10.1, 15), (9.85, 16.5), (14.15, 16.5), (13.9, 15)],
    [(6, 21.5), (18, 21.5), (18, 23), (6, 23)],
]

def glyph(contours):
    pen = TTGlyphPen(None)
    for points in contours:
        coordinates = [(round(x * 40), round((22 - y) * 40)) for x, y in points]
        pen.moveTo(coordinates[0])
        for point in coordinates[1:]:
            pen.lineTo(point)
        pen.closePath()
    return pen.glyph()

def main():
    data = ' '.join('M' + ' L'.join(f'{x:g} {y:g}' for x, y in points) + ' Z' for points in CONTOURS)
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'
           f'<path fill="currentColor" fill-rule="evenodd" d="{data}"/></svg>\n')
    (ROOT / 'ui/assets/beacon.svg').write_text(svg, encoding='utf-8')
    builder = FontBuilder(960, isTTF=True)
    builder.setupGlyphOrder(['.notdef', 'beacon'])
    builder.setupCharacterMap({0xE001: 'beacon'})
    builder.setupGlyf({'.notdef': glyph([]), 'beacon': glyph(CONTOURS)})
    builder.setupHorizontalMetrics({'.notdef': (960, 0), 'beacon': (960, 80)})
    builder.setupHorizontalHeader(ascent=880, descent=-80)
    builder.setupNameTable({'familyName': 'Codex Beacon Icons', 'styleName': 'Regular',
                           'uniqueFontIdentifier': 'Codex Beacon Icons 1.0',
                           'fullName': 'Codex Beacon Icons', 'psName': 'CodexBeaconIcons',
                           'version': 'Version 1.0', 'copyright': 'MIT License'})
    builder.setupOS2(sTypoAscender=880, sTypoDescender=-80, usWinAscent=880, usWinDescent=80)
    builder.setupPost()
    builder.setupMaxp()
    builder.font.recalcTimestamp = False
    builder.font['head'].created = builder.font['head'].modified = 3850070400
    builder.font.flavor = 'woff'
    builder.font.save(ROOT / 'ui/assets/beacon.woff')
    print('Generated the Codex Beacon SVG and WOFF.')

if __name__ == '__main__':
    main()
