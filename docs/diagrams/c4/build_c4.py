#!/usr/bin/env python3
"""Build the C4 architecture diagrams (Level 1 context, Level 2 container).

Outputs, in this folder, one SVG + one PNG per level and theme:

    c4-context-{dark,light}.{svg,png}
    c4-container-{dark,light}.{svg,png}

The SVGs need no network: Inter / JetBrains Mono (OFL) are embedded as
base64 woff2 and the technology logos are inline paths from Simple Icons
(CC0, see assets/icons.json). PNGs are rendered at 2x with headless Chromium.

    python docs/diagrams/c4/build_c4.py            # SVG + PNG
    python docs/diagrams/c4/build_c4.py --svg-only # no browser needed

Stdlib only. Every number drawn here comes from the repository at the commit
it ships with. If a number changes, change it here and re-run (see
docs/architecture.md, "C4 diagrams").
"""
from __future__ import annotations

import base64
import json
import shutil
import subprocess
import sys
import tempfile
from html import escape
from pathlib import Path

HERE = Path(__file__).resolve().parent
ASSETS = HERE / "assets"
ICONS = json.loads((ASSETS / "icons.json").read_text())["icons"]

REPO_URL = "github.com/adriansalvadorekomo/DataOps-Lakehouse-for-E-commerce-Analytics"

# ── themes ──────────────────────────────────────────────────────────────────
THEMES = {
    "dark": {
        "bg": "#0A0E17", "grid": "#141A26", "text": "#E8ECF3", "muted": "#9AA4B5", "faint": "#5E6879",
        "card": "#111726", "card2": "#0D1320", "border": "#232C3D", "tile": "#0B101B", "line": "#7D889B",
        "halo": "#0A0E17", "ops": "#5B9BFF", "ana": "#FF6A4D", "dlv": "#A98BFF", "ext": "#8C97A8",
        "person": "#3CC6E8", "bronze": "#D08A52", "silver": "#C3CCD7", "gold": "#EFC04F", "ok": "#3DDC97",
        "dark_logo": "#E8ECF3",
    },
    "light": {
        "bg": "#F6F7F9", "grid": "#E6E9EE", "text": "#0E1726", "muted": "#4A5568", "faint": "#8A94A6",
        "card": "#FFFFFF", "card2": "#FBFCFD", "border": "#D9DFE7", "tile": "#F1F4F8", "line": "#7A8699",
        "halo": "#F6F7F9", "ops": "#1F63E0", "ana": "#E2401F", "dlv": "#6D3FE0", "ext": "#64748B",
        "person": "#0A86B3", "bronze": "#A5602A", "silver": "#6E7C8C", "gold": "#B07D0A", "ok": "#0E9F6E",
        "dark_logo": "#0E1726",
    },
}

SANS = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"


def font_css() -> str:
    faces = [
        ("Inter", 400, "inter-latin-400-normal"), ("Inter", 500, "inter-latin-500-normal"),
        ("Inter", 600, "inter-latin-600-normal"), ("Inter", 700, "inter-latin-700-normal"),
        ("Inter", 800, "inter-latin-800-normal"),
        ("Inter", 400, "inter-latin-ext-400-normal"), ("Inter", 600, "inter-latin-ext-600-normal"),
        ("Inter", 700, "inter-latin-ext-700-normal"),
        ("JetBrains Mono", 400, "jetbrains-mono-latin-400-normal"),
        ("JetBrains Mono", 500, "jetbrains-mono-latin-500-normal"),
    ]
    out = []
    for fam, w, f in faces:
        b64 = base64.b64encode((ASSETS / "fonts" / f"{f}.woff2").read_bytes()).decode()
        rng = ";unicode-range:U+0100-02BA,U+20A0-20C0,U+2113" if "ext" in f else ""
        out.append(f"@font-face{{font-family:'{fam}';font-weight:{w};font-style:normal;"
                   f"src:url(data:font/woff2;base64,{b64}) format('woff2'){rng}}}")
    return "".join(out)


# ── drawing primitives ──────────────────────────────────────────────────────
class Canvas:
    def __init__(self, w: int, h: int, theme: str):
        self.w, self.h, self.t = w, h, THEMES[theme]
        self.theme = theme
        self.defs: list[str] = []
        self.back: list[str] = []   # boundaries
        self.mid: list[str] = []    # arrows
        self.front: list[str] = []  # cards, labels
        self._id = 0
        self._markers: dict[str, str] = {}

    def uid(self, p="c") -> str:
        self._id += 1
        return f"{p}{self._id}"

    # text ------------------------------------------------------------------
    def text(self, x, y, s, size=15, weight=400, color=None, family=SANS, anchor="start",
             spacing=0.0, layer=None, opacity=1.0):
        color = color or self.t["text"]
        ls = f' letter-spacing="{spacing}"' if spacing else ""
        op = f' opacity="{opacity}"' if opacity != 1 else ""
        (layer if layer is not None else self.front).append(
            f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" '
            f'font-weight="{weight}" fill="{color}" text-anchor="{anchor}"{ls}{op}>{escape(s)}</text>')

    # icons -----------------------------------------------------------------
    def logo(self, slug, x, y, size, color=None, layer=None):
        ic = ICONS[slug]
        col = color or f"#{ic['hex']}"
        if self._too_close(col):
            col = self.t["dark_logo"]
        s = size / 24
        (layer if layer is not None else self.front).append(
            f'<path transform="translate({x:.1f},{y:.1f}) scale({s:.4f})" fill="{col}" d="{ic["path"]}">'
            f'<title>{escape(ic["title"])}</title></path>')

    def _too_close(self, hex_col: str) -> bool:
        """Swap logos that vanish on the background (e.g. GitHub's near-black)."""
        h = hex_col.lstrip("#")
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return lum < 0.12 if self.theme == "dark" else lum > 0.80

    def tile(self, slug, x, y, size=34, layer=None):
        layer = layer if layer is not None else self.front
        t = self.t
        layer.append(f'<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{size * .26:.1f}" '
                     f'fill="{t["tile"]}" stroke="{t["border"]}" stroke-width="1"/>')
        if slug == "delta":
            self.delta_glyph(x + size / 2, y + size / 2, size * .58, layer)
        elif slug == "csv":
            self.file_glyph(x + size / 2, y + size / 2, size * .62, layer)
        elif slug == "contract":
            self.contract_glyph(x + size / 2, y + size / 2, size * .62, layer)
        else:
            pad = size * .2
            self.logo(slug, x + pad, y + pad, size - 2 * pad, layer=layer)

    def delta_glyph(self, cx, cy, s, layer):
        """Generic delta mark for Delta Lake (Simple Icons has no Delta Lake logo)."""
        c = "#00ADD4"
        h = s * .9
        layer.append(f'<path d="M{cx:.1f},{cy - h / 2:.1f} L{cx + s / 2:.1f},{cy + h / 2:.1f} '
                     f'L{cx - s / 2:.1f},{cy + h / 2:.1f} Z" fill="none" stroke="{c}" '
                     f'stroke-width="{s * .16:.1f}" stroke-linejoin="round"/>')

    def contract_glyph(self, cx, cy, s, layer):
        """Generic data-contract mark (shield + check) for Great Expectations."""
        c = self.t["ok"]
        w, h = s * .82, s
        x, y = cx - w / 2, cy - h / 2
        layer.append(f'<path d="M{cx:.1f},{y:.1f} L{x + w:.1f},{y + h * .2:.1f} V{y + h * .52:.1f} '
                     f'Q{x + w:.1f},{y + h * .86:.1f} {cx:.1f},{y + h:.1f} Q{x:.1f},{y + h * .86:.1f} '
                     f'{x:.1f},{y + h * .52:.1f} V{y + h * .2:.1f} Z" fill="none" stroke="{c}" '
                     f'stroke-width="1.8" stroke-linejoin="round"/>'
                     f'<path d="M{cx - w * .22:.1f},{cy + h * .02:.1f} L{cx - w * .04:.1f},{cy + h * .2:.1f} '
                     f'L{cx + w * .26:.1f},{cy - h * .14:.1f}" fill="none" stroke="{c}" stroke-width="2" '
                     f'stroke-linecap="round" stroke-linejoin="round"/>')

    def file_glyph(self, cx, cy, s, layer):
        c = self.t["ext"]
        w, h = s * .78, s
        x, y = cx - w / 2, cy - h / 2
        f = w * .32
        layer.append(f'<path d="M{x:.1f},{y:.1f} H{x + w - f:.1f} L{x + w:.1f},{y + f:.1f} V{y + h:.1f} '
                     f'H{x:.1f} Z" fill="none" stroke="{c}" stroke-width="1.8" stroke-linejoin="round"/>'
                     f'<path d="M{x + w * .22:.1f},{y + h * .55:.1f} H{x + w * .78:.1f} M{x + w * .22:.1f},'
                     f'{y + h * .75:.1f} H{x + w * .78:.1f}" stroke="{c}" stroke-width="1.6"/>')

    # cards -----------------------------------------------------------------
    def card(self, x, y, w, h, accent, eyebrow, title, tech, lines, icons=(),
             shape="box", title_size=21, line_size=14.5):
        t = self.t
        cid = self.uid()
        if shape == "cylinder":
            e = 11
            body = (f'M{x},{y + e} A{w / 2},{e} 0 0 1 {x + w},{y + e} V{y + h - e} '
                    f'A{w / 2},{e} 0 0 1 {x},{y + h - e} Z')
            self.front.append(f'<path d="{body}" fill="{t["card"]}" stroke="{t["border"]}" stroke-width="1.25"/>')
            self.front.append(f'<ellipse cx="{x + w / 2}" cy="{y + e}" rx="{w / 2}" ry="{e}" fill="{t["card2"]}" '
                              f'stroke="{accent}" stroke-width="2"/>')
            top = y + 2 * e - 4
        else:
            self.defs.append(f'<clipPath id="{cid}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/></clipPath>')
            self.front.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{t["card"]}" '
                              f'stroke="{t["border"]}" stroke-width="1.25" filter="url(#shadow)"/>')
            self.front.append(f'<rect x="{x}" y="{y}" width="{w}" height="4" fill="{accent}" clip-path="url(#{cid})"/>')
            top = y
        px = x + 20
        self.text(px, top + 31, eyebrow, 11.5, 500, accent, MONO, spacing=1.1)
        n = len(icons)
        for i, slug in enumerate(icons):
            self.tile(slug, x + w - 16 - 32 * (n - i) - 6 * (n - 1 - i), top + 14, 32)
        self.text(px, top + 61, title, title_size, 700)
        if tech:
            self.text(px, top + 84, tech, 12.5, 400, t["muted"], MONO)
        for i, ln in enumerate(lines):
            self.text(px, top + 111 + i * 20, ln, line_size, 400, t["muted"])

    def person(self, x, y, w, h, title, lines, color=None):
        t = self.t
        c = color or t["person"]
        cx = x + w / 2
        self.front.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="28" fill="{t["card"]}" '
                          f'stroke="{c}" stroke-width="1.6" filter="url(#shadow)"/>')
        self.front.append(f'<circle cx="{cx}" cy="{y - 2}" r="21" fill="{t["card"]}" stroke="{c}" stroke-width="1.6"/>')
        self.front.append(f'<circle cx="{cx}" cy="{y - 7}" r="6.5" fill="{c}"/>'
                          f'<path d="M{cx - 11},{y + 11} a11,9 0 0 1 22,0" fill="{c}"/>')
        self.text(cx, y + 42, "PERSON", 11, 500, c, MONO, "middle", 1.2)
        self.text(cx, y + 68, title, 19, 700, anchor="middle")
        for i, ln in enumerate(lines):
            self.text(cx, y + 93 + i * 19, ln, 14, 400, t["muted"], anchor="middle")

    def boundary(self, x, y, w, h, color, eyebrow, title, icons=(), tab="left", dash=True):
        t = self.t
        d = ' stroke-dasharray="8 7"' if dash else ""
        self.back.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="22" fill="{color}" fill-opacity="0.045" '
                         f'stroke="{color}" stroke-opacity="0.75" stroke-width="1.6"{d}/>')
        tw = 26 + len(icons) * 30 + len(eyebrow) * 8.4 + len(title) * 8.9 + 26
        tx = x + 28 if tab == "left" else x + w - 28 - tw
        self.back.append(f'<rect x="{tx}" y="{y - 17}" width="{tw:.0f}" height="34" rx="17" fill="{t["bg"]}" '
                         f'stroke="{color}" stroke-opacity="0.75" stroke-width="1.4"/>')
        cx = tx + 14
        for slug in icons:
            self.logo(slug, cx, y - 9, 18, layer=self.back)
            cx += 30
        self.text(cx, y + 5, eyebrow, 12, 500, color, MONO, spacing=1.1, layer=self.back)
        cx += len(eyebrow) * 8.4 + 12
        self.text(cx, y + 5.5, title, 15, 600, t["text"], layer=self.back)

    # arrows ----------------------------------------------------------------
    def arrow(self, pts, color=None, width=1.8, dashed=False, halo=False, head=True):
        t = self.t
        c = color or t["line"]
        mk = self.marker(c) if head else None
        d = "M" + " L".join(f"{px},{py}" for px, py in pts)
        if halo:
            self.mid.append(f'<path d="{d}" fill="none" stroke="{t["halo"]}" stroke-width="9" stroke-linecap="round"/>')
        dash = ' stroke-dasharray="6 6"' if dashed else ""
        m = f' marker-end="url(#{mk})"' if mk else ""
        self.mid.append(f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{width}" '
                        f'stroke-linejoin="round"{dash}{m}/>')

    def marker(self, color):
        if color not in self._markers:
            mid = self.uid("m")
            self._markers[color] = mid
            self.defs.append(f'<marker id="{mid}" viewBox="0 0 12 12" refX="10.5" refY="6" markerWidth="10" '
                             f'markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">'
                             f'<path d="M1,1.5 L11,6 L1,10.5 Z" fill="{color}"/></marker>')
        return self._markers[color]

    def label(self, x, y, lines, anchor="middle", tech=None, color=None):
        """Relationship label: pill with 1–2 lines + optional [technology] line."""
        t = self.t
        rows = [(s, 13.5, 500, t["text"] if color is None else color, SANS) for s in lines]
        if tech:
            rows.append((tech, 12, 400, t["muted"], MONO))
        wmax = max(len(r[0]) * (r[1] * (0.6 if r[4] == MONO else 0.53)) for r in rows)
        h = 12 + 18 * len(rows)
        w = wmax + 24
        bx = x - w / 2 if anchor == "middle" else (x - w if anchor == "end" else x)
        self.front.append(f'<rect x="{bx:.1f}" y="{y - h / 2:.1f}" width="{w:.1f}" height="{h}" rx="9" '
                          f'fill="{t["bg"]}" fill-opacity="0.94" stroke="{t["border"]}" stroke-width="1"/>')
        cx = bx + w / 2
        for i, (s, sz, wt, col, fam) in enumerate(rows):
            self.text(cx, y - h / 2 + 22 + i * 18, s, sz, wt, col, fam, "middle")

    # page ------------------------------------------------------------------
    def header(self, eyebrow, title, subtitle, stack):
        t = self.t
        self.text(60, 66, eyebrow, 14, 500, t["ana"], MONO, spacing=1.6)
        self.text(60, 112, title, 40, 800, spacing=-0.6)
        self.text(60, 146, subtitle, 17.5, 400, t["muted"])
        x = self.w - 60 - len(stack) * 52 + 8
        for slug in stack:
            self.tile(slug, x, 70, 44)
            x += 52
        self.text(self.w - 60, 52, "STACK", 11.5, 500, t["faint"], MONO, "end", 1.4)

    def legend(self, y, items_note):
        t = self.t
        x = 60
        def sw(kind, label):
            nonlocal x
            if kind == "person":
                self.front.append(f'<rect x="{x}" y="{y - 13}" width="26" height="18" rx="9" fill="none" stroke="{t["person"]}" stroke-width="1.6"/>')
            elif kind == "container":
                self.front.append(f'<rect x="{x}" y="{y - 13}" width="26" height="18" rx="4" fill="{t["card"]}" stroke="{t["border"]}"/>'
                                  f'<rect x="{x}" y="{y - 13}" width="26" height="3" fill="{t["ops"]}"/>')
            elif kind == "store":
                self.front.append(f'<path d="M{x},{y - 10} a13,4 0 0 1 26,0 v12 a13,4 0 0 1 -26,0 Z" fill="{t["card"]}" stroke="{t["gold"]}" stroke-width="1.4"/>')
            elif kind == "external":
                self.front.append(f'<rect x="{x}" y="{y - 13}" width="26" height="18" rx="4" fill="{t["card"]}" stroke="{t["border"]}"/>'
                                  f'<rect x="{x}" y="{y - 13}" width="26" height="3" fill="{t["ext"]}"/>')
            elif kind == "boundary":
                self.front.append(f'<rect x="{x}" y="{y - 13}" width="26" height="18" rx="5" fill="none" stroke="{t["ana"]}" stroke-dasharray="4 3" stroke-width="1.4"/>')
            elif kind == "rel":
                self.front.append(f'<path d="M{x},{y - 4} H{x + 22}" stroke="{t["line"]}" stroke-width="1.8" marker-end="url(#{self.marker(t["line"])})"/>')
            self.text(x + 36, y + 1, label, 13.5, 500, t["muted"])
            x += 36 + len(label) * 7.4 + 34
        self.text(60, y - 34, "LEGEND", 11.5, 500, t["faint"], MONO, spacing=1.4)
        for k, lbl in (("person", "Person"), ("container", "Container"), ("store", "Data store"),
                       ("external", "External system"), ("boundary", "Boundary"), ("rel", "Uses / data flow")):
            sw(k, lbl)
        self.text(self.w - 60, y + 1, items_note, 13, 400, t["faint"], MONO, "end")

    def svg(self, title, desc) -> str:
        t = self.t
        grid = (f'<pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">'
                f'<circle cx="1" cy="1" r="1" fill="{t["grid"]}"/></pattern>')
        sh_op = 0.35 if self.theme == "dark" else 0.07
        shadow = (f'<filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">'
                  f'<feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#000" flood-opacity="{sh_op}"/></filter>')
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
                f'viewBox="0 0 {self.w} {self.h}" role="img" aria-labelledby="t d">'
                f'<title id="t">{escape(title)}</title><desc id="d">{escape(desc)}</desc>'
                f'<defs><style>{font_css()}</style>{grid}{shadow}{"".join(self.defs)}</defs>'
                f'<rect width="100%" height="100%" fill="{t["bg"]}"/>'
                f'<rect width="100%" height="100%" fill="url(#grid)"/>'
                + "".join(self.back) + "".join(self.mid) + "".join(self.front) + "</svg>")


STACK = ["databricks", "apachespark", "delta", "postgresql", "fastapi", "react",
         "terraform", "githubactions", "docker", "mlflow"]


# ── Level 2 — container diagram ─────────────────────────────────────────────
def container(theme: str) -> str:
    c = Canvas(2400, 1930, theme)
    t = c.t
    c.header("C4 MODEL  ·  LEVEL 2  ·  CONTAINER DIAGRAM",
             "Smart-ERP — DataOps Lakehouse for E-commerce Analytics",
             "Marketplace, India, INR ₹.  PostgreSQL serves a live control tower; Great Expectations "
             "contracts gate every import; Databricks builds Gold behind a fail-fast gate.", STACK)

    # people + the new-data source
    c.person(70, 212, 230, 120, "Marketplace operator", ["Acts on the brief: orders,", "deliveries, stock"])
    c.person(320, 212, 230, 120, "Business stakeholder", ["Reads pace, margin, sellers;", "asks the assistant"])
    c.card(575, 200, 330, 130, t["ext"], "EXTERNAL · NEW DATA", "Marketplace exports",
           "CSV · the source's 20 columns", ["Uploaded on the Data page"], icons=("csv",), title_size=19)
    c.person(1720, 212, 290, 120, "Data analyst", ["Explores Gold in AI/BI", "dashboards and Genie"])

    rules = [("PostgreSQL owns every write", t["ops"]),
             ("Databricks never writes back", t["ana"]),
             ("No import without the contract", t["ok"]),
             ("No Gold without a green gate", t["gold"])]
    c.text(1300, 222, "DESIGN RULES", 11.5, 500, t["faint"], MONO, "middle", 1.4)
    for i, (txt, col) in enumerate(rules):
        cx = 930 + (i % 2) * 380
        cy = 240 + (i // 2) * 50
        c.front.append(f'<rect x="{cx}" y="{cy}" width="360" height="38" rx="19" fill="{t["card"]}" stroke="{t["border"]}"/>'
                       f'<circle cx="{cx + 22}" cy="{cy + 19}" r="5" fill="{col}"/>')
        c.text(cx + 38, cy + 24.5, txt, 15, 600)

    # boundaries
    c.boundary(40, 380, 960, 800, t["ops"], "OPERATIONAL PLANE", "Docker Compose",
               icons=("docker",), tab="right")
    c.boundary(1060, 380, 1300, 800, t["ana"], "ANALYTICAL PLANE",
               "Databricks Free Edition · Unity Catalog workspace.*", icons=("databricks",))
    c.boundary(1090, 452, 600, 208, t["ext"], "EXTERNAL", "Databricks AI services")
    c.boundary(40, 1380, 2320, 250, t["dlv"], "DELIVERY PLANE", "GitHub · trunk-based, PR-gated",
               icons=("github",))

    # operational containers
    c.card(80, 455, 380, 195, t["ops"], "CONTAINER · WEB APP", "Control Tower",
           "React 19 · Vite · Radix · GSAP",
           ["Today brief, 9 role pages, ⌘K,", "imports and data-contract views.",
            "nginx serves it, proxies /api."],
           icons=("react", "gsap", "nginx"))
    c.card(540, 455, 420, 195, t["ops"], "CONTAINER · REST API", "Backend API",
           "FastAPI · SQLAlchemy · Pydantic",
           ["/insights /stats /orders /imports /ai", "logs every answer + its 👍/👎 rating",
            "brief cached on a data version · 59 tests"],
           icons=("fastapi", "python"))
    c.card(80, 720, 380, 180, t["ops"], "CONTAINER · BATCH JOB", "Revenue forecast",
           "scikit-learn Random Forest · Prophet",
           ["30-day outlook; RF ships (3.4% MAPE),", "Prophet rides as a second opinion."],
           icons=("scikitlearn", "python"))
    c.card(620, 720, 340, 180, t["ok"], "LIBRARY · IN THE API", "Data contracts",
           "Great Expectations 1.x",
           ["Import contract · 46 expectations", "Books contract · 29 (R1–R7, H1)",
            "runs stored; failures hit the brief"],
           icons=("contract", "pandas"), title_size=20)
    c.card(540, 970, 420, 180, t["ops"], "DATABASE · SYSTEM OF RECORD", "PostgreSQL 16",
           "11 migrations · CHECK + FK",
           ["6 core tables · 1,000,000 orders", "+ imports, contract runs, answer log",
            "final_price CHECK ±₹5.00"],
           icons=("postgresql",), shape="cylinder")

    # analytical containers — row 1 (consumers)
    c.card(1110, 490, 270, 155, t["ext"], "EXTERNAL · LLM", "Foundation Model API",
           "databricks-gpt-oss-120b", ["Answers only from the", "retrieved doc chunks"],
           icons=("databricks",), title_size=19.5)
    c.card(1410, 490, 260, 155, t["ext"], "EXTERNAL · NL-TO-SQL", "Genie space",
           "over the 4 Gold marts", ["Analyst tool in the", "workspace; not in the app"],
           icons=("databricks",), title_size=19.5)
    c.card(1720, 455, 290, 195, t["ana"], "CONTAINER · BI", "AI/BI dashboards",
           "Databricks SQL warehouse",
           ["Revenue and fulfillment", "dashboards on Gold", "(bi/*.lvdash.json)"],
           icons=("databricks",))
    c.card(2040, 455, 290, 195, t["ana"], "CONTAINER · ML", "MLflow experiments",
           "notebook 05 · scikit-learn",
           ["Return propensity explored:", "no feature predicts returns,", "so no model is served"],
           icons=("mlflow", "scikitlearn"))

    # analytical containers — row 2 (medallion)
    c.card(1095, 760, 180, 200, t["ext"], "UC VOLUME", "Landing", "bronze/landing",
           ["1M-row CSV,", "uploaded with", "dbx-upload"], icons=("csv",))
    c.card(1325, 760, 200, 200, t["bronze"], "DELTA TABLE", "Bronze", "raw_purchases",
           ["COPY INTO,", "append-only,", "audit columns"], icons=("delta",), shape="cylinder")
    c.card(1575, 760, 200, 200, t["silver"], "DELTA TABLES", "Silver", "6 entity tables",
           ["Typed, trimmed,", "enums normalized", "(PySpark)"], icons=("apachespark",), shape="cylinder")
    c.card(1825, 760, 160, 200, t["ok"], "QUALITY GATE", "DQ R1–R9", "fail-fast",
           ["0 violations", "at 1M rows;", "blocks Gold"])
    c.card(2035, 760, 295, 200, t["gold"], "DELTA TABLES · MARTS", "Gold",
           "fact_sales · sales_daily",
           ["customer_360 · inventory_kpis", "+ dim_customer/product/date", "₹9.94B, reconciled ±₹1,000"],
           icons=("delta",), shape="cylinder")

    # workflows bar
    c.front.append(f'<rect x="1325" y="980" width="1005" height="42" rx="10" fill="{t["card2"]}" '
                   f'stroke="{t["ana"]}" stroke-opacity="0.6" stroke-width="1.3"/>')
    c.logo("databricks", 1340, 991, 20)
    c.text(1370, 1006.5, "Databricks Workflows", 14.5, 700)
    c.text(1540, 1006.5, "smart-erp-medallion · serverless", 12.5, 400, t["muted"], MONO)
    c.text(2316, 1006.5, "bronze_ingest › silver_build › dq_gate › gold_build › sql_refresh",
           12.5, 500, t["ana"], MONO, "end")

    # shared rule vocabulary
    c.front.append(f'<rect x="1240" y="1062" width="1090" height="84" rx="12" fill="{t["card2"]}" '
                   f'stroke="{t["ok"]}" stroke-opacity="0.55" stroke-dasharray="6 5" stroke-width="1.3"/>')
    c.text(1262, 1090, "ONE RULE VOCABULARY · GE CONTRACTS + LAKEHOUSE GATE", 11.5, 500, t["ok"], MONO, spacing=1.1)
    c.text(1262, 1118, "R1 keys · R2 unique · R3 foreign keys · R4 money invariant · R5 values · R6 ranges · "
           "R7 dates · R8 revenue · R9 schema · H1 hygiene", 14, 500, t["muted"])

    # relationships — people and new data
    c.arrow([(185, 334), (185, 455)], t["person"])
    c.arrow([(435, 334), (435, 455)], t["person"])
    c.label(310, 405, ["Uses"], tech="HTTPS")
    c.arrow([(600, 330), (600, 455)], t["ext"], 2)
    c.label(590, 418, ["POST /imports"], anchor="end")
    c.arrow([(1865, 334), (1865, 455)], t["person"])
    c.label(1865, 405, ["Explores Gold"], tech="Databricks UI")

    # operational
    c.arrow([(460, 552), (540, 552)])
    c.label(500, 520, ["/api"], tech="JSON")
    c.arrow([(575, 650), (575, 970)])
    c.label(565, 935, ["reads / writes"], anchor="end", tech="SQLAlchemy")
    c.arrow([(790, 650), (790, 720)], t["ok"], 2)
    c.label(800, 685, ["gates every CSV row"], anchor="start", color=t["ok"])
    c.arrow([(790, 900), (790, 970)], t["ok"], 2)
    c.label(800, 935, ["validates the books"], anchor="start", color=t["ok"])
    c.arrow([(270, 900), (270, 1060), (540, 1060)])
    c.label(405, 1060, ["writes forecasts"])

    # API → AI services
    c.arrow([(960, 568), (1090, 568)])
    c.label(1025, 528, ["document", "answers"], tech="REST")

    # medallion flow
    for x0, x1, col in ((1275, 1325, t["bronze"]), (1525, 1575, t["silver"]),
                        (1775, 1825, t["ok"]), (1985, 2035, t["gold"])):
        c.arrow([(x0, 860), (x1, 860)], col, 2.4)
    for xc in (1425, 1675, 1905, 2182):
        c.mid.append(f'<path d="M{xc},962 V980" stroke="{t["ana"]}" stroke-opacity="0.6" stroke-width="1.4" stroke-dasharray="3 3"/>')

    # Gold → consumers bus
    c.mid.append(f'<path d="M2182,760 V705 H1540" fill="none" stroke="{t["gold"]}" stroke-width="2.2"/>')
    c.arrow([(2182, 705), (2182, 650)], t["gold"], 2.2)
    c.arrow([(1865, 705), (1865, 650)], t["gold"], 2.2)
    c.arrow([(1540, 705), (1540, 645)], t["gold"], 2.2)
    c.label(1990, 705, ["reads Gold"], color=t["gold"])

    # source CSV (bottom centre) → seed + landing
    c.card(830, 1215, 400, 110, t["ext"], "EXTERNAL · DATASET", "E-commerce CSV",
           "1M rows · 133 MB · git-ignored", [], icons=("csv",))
    c.arrow([(900, 1215), (900, 1150)], t["ext"], 2)
    c.label(888, 1188, ["seed · full refresh"], anchor="end")
    c.arrow([(1185, 1215), (1185, 960)], t["ext"], 2)
    c.label(1198, 1188, ["dbx-upload"], anchor="start")

    # delivery plane
    y0 = 1433
    c.person(80, y0 + 7, 250, 160, "Data engineer",
             ["Ships every change through", "a PR; owns contracts and IaC"], color=t["dlv"])
    c.card(380, y0, 260, 170, t["dlv"], "SOURCE CONTROL", "GitHub repo", "trunk-based",
           ["main is protected;", "merges only via PR"], icons=("github",))
    c.card(690, y0, 400, 170, t["dlv"], "CI · EVERY PULL REQUEST", "GitHub Actions CI",
           "ci.yml · 10 jobs · no secrets",
           ["lakehouse unittest, Gold SQL guards, migrations,", "pytest incl. a Great Expectations run,",
            "web lint + tests + build, terraform validate"], icons=("githubactions",))
    c.card(1140, y0, 400, 170, t["dlv"], "CD · TAG v*", "GitHub Actions CD", "cd.yml · 3 jobs",
           ["Build images to GHCR, smoke the compose", "stack, deploy the job, run the medallion,",
            "validate Gold counts and revenue."], icons=("githubactions", "docker"))
    c.card(1590, y0, 340, 170, t["dlv"], "INFRASTRUCTURE AS CODE", "Terraform", "databricks provider",
           ["bronze / silver / gold schemas,", "landing + documents volumes,", "the medallion job"],
           icons=("terraform",))
    c.card(1980, y0, 340, 170, t["dlv"], "DEVELOPER TOOLING", "mise + uv", "19 tasks · uv.lock",
           ["dev, seed, governance, forecast,", "dbx-*, tf-*; embedded Postgres,", "no Docker needed locally"],
           icons=("uv", "python"))

    c.arrow([(330, y0 + 85), (380, y0 + 85)], t["dlv"])
    c.arrow([(640, y0 + 85), (690, y0 + 85)], t["dlv"])
    c.arrow([(1090, y0 + 85), (1140, y0 + 85)], t["dlv"])
    c.label(1115, y0 - 17, ["tag v*"], color=t["dlv"])
    c.arrow([(1180, y0), (1180, 1354), (700, 1354), (700, 1180)], t["dlv"])
    c.label(688, 1270, ["images (GHCR)", "+ compose smoke"], anchor="end")
    c.arrow([(1440, y0), (1440, 1180)], t["dlv"])
    c.label(1440, 1270, ["deploy_job.py", "run + validate Gold"])
    c.arrow([(1760, y0), (1760, 1180)], t["dlv"])
    c.label(1760, 1270, ["provisions schemas,", "volumes, job"])

    # results band
    res = [("1,000,000", "orders, Bronze to Gold"),
           ("0", "DQ violations, R1–R9"),
           ("₹9.94B", "Gold revenue, ±₹1,000"),
           ("75", "GE expectations (46 + 29)"),
           ("10", "CI jobs on every PR"),
           ("96", "tests: API, CD, lakehouse, web"),
           ("3.4%", "MAPE, 30-day forecast")]
    c.text(60, 1680, "VALIDATED AT 1M ROWS", 11.5, 500, t["faint"], MONO, spacing=1.4)
    n = len(res)
    tw = (2280 - (n - 1) * 18) / n
    for i, (v, cap) in enumerate(res):
        x = 60 + i * (tw + 18)
        c.front.append(f'<rect x="{x:.1f}" y="1695" width="{tw:.1f}" height="104" rx="14" fill="{t["card"]}" stroke="{t["border"]}"/>')
        c.text(x + 20, 1750, v, 34, 800, t["ok"] if v in ("0", "75") else t["text"], spacing=-0.6)
        c.text(x + 20, 1780, cap, 13.5, 400, t["muted"])

    c.legend(1885, REPO_URL)
    return c.svg("Smart-ERP C4 Level 2 — container diagram",
                 "Operational plane (Control Tower web app, FastAPI, forecast job, Great Expectations data "
                 "contracts, PostgreSQL), analytical plane (Databricks: landing volume, Bronze, Silver, DQ gate "
                 "R1-R9, Gold, AI/BI dashboards, MLflow, Genie, Foundation Model API), delivery plane (GitHub, "
                 "CI, CD, Terraform, mise + uv). Marketplace exports enter through POST /imports.")


# ── Level 1 — system context ────────────────────────────────────────────────
def context(theme: str) -> str:
    c = Canvas(2400, 1420, theme)
    t = c.t
    c.header("C4 MODEL  ·  LEVEL 1  ·  SYSTEM CONTEXT",
             "Smart-ERP — who uses it, and what it depends on",
             "One software system, four kinds of people, four external systems — the marketplace control tower.", STACK)

    # system
    sx, sy, sw_, sh = 840, 270, 720, 760
    c.front.append(f'<rect x="{sx}" y="{sy}" width="{sw_}" height="{sh}" rx="26" fill="{t["card"]}" '
                   f'stroke="{t["ana"]}" stroke-width="2.2" filter="url(#shadow)"/>')
    c.text(sx + 44, sy + 56, "SOFTWARE SYSTEM", 13, 500, t["ana"], MONO, spacing=1.4)
    c.text(sx + 44, sy + 106, "Smart-ERP DataOps Platform", 36, 800, spacing=-0.6)
    for i, ln in enumerate(["A marketplace control tower (India, INR ₹). PostgreSQL",
                            "records every order and serves a live morning brief;",
                            "Great Expectations contracts gate every import and the",
                            "books; a Databricks medallion builds Gold for BI and AI",
                            "behind a fail-fast quality gate."]):
        c.text(sx + 44, sy + 152 + i * 27, ln, 18, 400, t["muted"])
    planes = [("Operational plane", "Control Tower · FastAPI · GE contracts · PostgreSQL 16",
               t["ops"], ("react", "fastapi", "postgresql")),
              ("Analytical plane", "Bronze › Silver › DQ gate R1–R9 › Gold · AI/BI · MLflow",
               t["ana"], ("databricks", "apachespark", "delta")),
              ("Delivery plane", "GitHub Actions CI/CD · Terraform · mise + uv",
               t["dlv"], ("githubactions", "terraform", "docker"))]
    for i, (name, sub, col, icons) in enumerate(planes):
        y = sy + 318 + i * 104
        c.front.append(f'<rect x="{sx + 44}" y="{y}" width="{sw_ - 88}" height="86" rx="14" fill="{t["card2"]}" '
                       f'stroke="{col}" stroke-opacity="0.7" stroke-dasharray="7 6" stroke-width="1.4"/>')
        c.text(sx + 68, y + 36, name, 19, 700)
        c.text(sx + 68, y + 63, sub, 13, 400, t["muted"], MONO)
        for j, slug in enumerate(icons):
            c.tile(slug, sx + sw_ - 70 - (len(icons) - j) * 46, y + 22, 40)
    c.text(sx + sw_ / 2, sy + sh - 34, "Zoom in: Level 2 container diagram", 14, 500, t["faint"], MONO, "middle")

    # people (left)
    ppl = [(335, "Marketplace operator", ["Day-to-day orders,", "deliveries and stock"],
            ["Acts on the brief; books orders,", "closes shipments, imports data"], "HTTPS"),
           (645, "Business stakeholder", ["Needs pace, margin", "and seller performance"],
            ["Reads the brief and KPIs;", "asks the assistant"], "HTTPS"),
           (955, "Data analyst", ["Works in the", "Databricks workspace"],
            ["Explores Gold in AI/BI", "dashboards and Genie"], "Databricks UI")]
    for cy, name, desc, rel, tech in ppl:
        c.person(100, cy - 62, 380, 132, name, desc)
        c.arrow([(480, cy), (sx, cy)], t["person"])
        c.label(660, cy, rel, tech=tech)

    # externals (right)
    ext = [(335, "Marketplace data", "CSV · 1M-row history + new exports", ["Seed: 24 months of orders;", "exports: incremental imports"],
            ("csv",), ["Seeds the books, lands in", "Bronze; exports go through GE"], "file upload", "in"),
           (645, "Databricks AI services", "Foundation Model API · Genie", ["LLM for document answers;", "Genie for analysts"],
            ("databricks",), ["Answers questions on", "attached documents"], "REST", "out"),
           (955, "Hugging Face Hub", "all-MiniLM-L6-v2", ["Sentence-embedding", "model weights"],
            ("huggingface",), ["Downloads the", "embedding model"], "HTTPS", "out")]
    for cy, name, tech, desc, icons, rel, rtech, direction in ext:
        c.card(1920, cy - 75, 400, 150, t["ext"], "EXTERNAL SYSTEM", name, tech, desc, icons=icons)
        pts = [(1920, cy), (sx + sw_, cy)] if direction == "in" else [(sx + sw_, cy), (1920, cy)]
        c.arrow(pts, t["ext"])
        c.label(1740, cy, rel, tech=rtech)

    # delivery (bottom)
    c.person(100, 1150, 380, 132, "Data engineer", ["Owns pipeline, data", "contracts and IaC"], color=t["dlv"])
    c.card(1000, 1135, 400, 150, t["ext"], "EXTERNAL SYSTEM", "GitHub", "repo · Actions · GHCR",
           ["10 CI jobs gate every PR;", "CD runs on a v* tag"], icons=("github", "githubactions"))
    c.arrow([(480, 1216), (1000, 1216)], t["dlv"])
    c.label(740, 1216, ["Opens PRs, tags releases"], tech="git")
    c.arrow([(1200, 1135), (1200, sy + sh)], t["dlv"])
    c.label(1200, 1083, ["CI gates changes; CD ships images", "and the Databricks job"], tech="GitHub Actions")

    c.legend(1385, REPO_URL)
    return c.svg("Smart-ERP C4 Level 1 — system context",
                 "Marketplace operator, business stakeholder, data analyst and data engineer use the Smart-ERP "
                 "DataOps platform, which depends on the e-commerce CSV dataset, Databricks AI services, "
                 "Hugging Face Hub and GitHub.")


# ── render ──────────────────────────────────────────────────────────────────
def chromium() -> str | None:
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
        if p := shutil.which(name):
            return p
    return None


def to_png(svg_path: Path, w: int, h: int, browser: str) -> None:
    with tempfile.TemporaryDirectory() as d:
        page = Path(d) / "p.html"
        page.write_text(f'<!doctype html><html><body style="margin:0">'
                        f'<img src="{svg_path.as_uri()}" width="{w}" height="{h}" style="display:block"></body></html>')
        subprocess.run([browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                        "--force-device-scale-factor=2", f"--window-size={w},{h}",
                        "--allow-file-access-from-files", f"--user-data-dir={d}/u",
                        f"--screenshot={svg_path.with_suffix('.png')}", page.as_uri()],
                       check=True, capture_output=True, timeout=120)


def main() -> None:
    svg_only = "--svg-only" in sys.argv
    browser = None if svg_only else chromium()
    if not svg_only and not browser:
        sys.exit("Chromium not found: install it or pass --svg-only")
    for name, fn, size in (("context", context, (2400, 1420)), ("container", container, (2400, 1930))):
        for theme in THEMES:
            out = HERE / f"c4-{name}-{theme}.svg"
            out.write_text(fn(theme))
            if browser:
                to_png(out, *size, browser)
            print(f"wrote {out.relative_to(HERE)}" + ("" if svg_only else " + .png"))


if __name__ == "__main__":
    main()
