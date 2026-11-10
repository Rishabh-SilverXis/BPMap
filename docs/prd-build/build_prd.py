"""Build the PRD PDF from docs/PRD_BPMap_for_Workday.md.

Usage:  python build_prd.py            (needs: pip install markdown; Google Chrome installed)

Pipeline: Markdown -> HTML (python-markdown) -> each Mermaid block that follows a
`<!-- figure: key -->` marker is swapped for a hand-built SVG from figures.py ->
headless Chrome prints the page to PDF.
"""
import pathlib
import re
import subprocess
import sys
import tempfile

import markdown

from figures import FIGURES, cover_art

HERE = pathlib.Path(__file__).resolve().parent
DOCS = HERE.parent
MD = DOCS / "PRD_BPMap_for_Workday.md"
HTML_OUT = HERE / "PRD_BPMap_for_Workday.html"
PDF_OUT = DOCS / "PRD_BPMap_for_Workday.pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Sections that start on a new page (by leading number / label)
PAGE_BREAK_BEFORE = {"1.", "3.", "4.", "5.", "6.", "7.", "8.", "9.", "10.", "11.", "13.", "14.", "17.", "Appendix A"}

CSS = r"""
@page { size: A4; margin: 20mm 16mm 18mm 16mm;
  @top-left { content: "BPMap for Workday"; font: 600 8pt -apple-system, 'Helvetica Neue', Arial; color: #0F9D8A; }
  @top-right { content: "Product Requirements Document · v1.0 · Draft"; font: 8pt -apple-system, 'Helvetica Neue', Arial; color: #94A3B8; }
  @bottom-left { content: "Independent product · not affiliated with Workday, Inc."; font: 7.5pt -apple-system, 'Helvetica Neue', Arial; color: #94A3B8; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt -apple-system, 'Helvetica Neue', Arial; color: #64748B; }
}
@page cover { margin: 0; @top-left { content: none } @top-right { content: none } @bottom-left { content: none } @bottom-right { content: none } }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html { font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; color: #1E293B; font-size: 9.6pt; line-height: 1.5; }
body { margin: 0; }

/* cover */
.cover { page: cover; height: 297mm; width: 210mm; position: relative; overflow: hidden;
  background: linear-gradient(160deg, #0B1B36 0%, #14284B 55%, #0F3B57 100%); color: #fff; padding: 26mm 20mm; break-after: page; }
.cover .eyebrow { letter-spacing: .18em; font-size: 9pt; font-weight: 700; color: #5EEAD4; text-transform: uppercase; }
.cover h1 { font-size: 40pt; line-height: 1.05; margin: 10mm 0 5mm; font-weight: 800; letter-spacing: -.02em; }
.cover h1 span { color: #5EEAD4; }
.cover .tag { font-size: 14pt; color: #CBD5E1; max-width: 150mm; line-height: 1.4; }
.cover .bar { width: 28mm; height: 2.2mm; background: #0F9D8A; border-radius: 2mm; margin: 12mm 0 10mm; }
.cover .meta { display: grid; grid-template-columns: 34mm 1fr; row-gap: 2.4mm; font-size: 10pt; max-width: 150mm; }
.cover .meta div:nth-child(odd) { color: #94A3B8; text-transform: uppercase; font-size: 8pt; letter-spacing: .1em; padding-top: .6mm; }
.cover .cover-art { position: absolute; left: 20mm; right: 20mm; bottom: 34mm; width: 170mm; }
.cover .foot { position: absolute; left: 20mm; right: 20mm; bottom: 14mm; font-size: 7.8pt; color: #94A3B8; border-top: 1px solid rgba(255,255,255,.15); padding-top: 3mm; }

/* doc control + toc */
.control { break-after: page; }
.control h2.plain { border: 0; padding: 0; margin-top: 0; }
.toc { columns: 2; column-gap: 10mm; padding: 0; list-style: none; margin: 0; }
.toc li { break-inside: avoid; padding: 1.3mm 0; border-bottom: 1px dotted #CBD5E1; font-size: 9.6pt; }
.toc a { color: #14284B; text-decoration: none; }
.toc .num { display: inline-block; width: 8mm; color: #0F9D8A; font-weight: 700; }

/* body */
h2 { font-size: 17pt; color: #14284B; margin: 9mm 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid #0F9D8A; break-after: avoid; letter-spacing: -.01em; }
h2.pb { break-before: page; margin-top: 0; }
h3 { font-size: 12pt; color: #14284B; margin: 6mm 0 2mm; break-after: avoid; }
p { margin: 0 0 2.6mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1mm; }
strong { color: #0F172A; }
code { font-family: 'SF Mono', Menlo, monospace; font-size: 8.4pt; background: #F1F5F9; padding: .2mm 1.2mm; border-radius: 1mm; color: #0F3B57; }
blockquote { margin: 3mm 0 4mm; padding: 3mm 4.5mm; background: #ECFDF8; border-left: 3px solid #0F9D8A; border-radius: 0 2mm 2mm 0; color: #134E4A; }
blockquote p { margin: 0; }
hr { border: 0; border-top: 1px solid #E2E8F0; margin: 6mm 0; }

table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 8.3pt; line-height: 1.38; }
thead { display: table-header-group; }
th { background: #14284B; color: #fff; text-align: left; font-weight: 600; padding: 1.8mm 2.2mm; font-size: 8pt; }
th:first-child { border-top-left-radius: 1.5mm; } th:last-child { border-top-right-radius: 1.5mm; }
td { padding: 1.6mm 2.2mm; border-bottom: 1px solid #E2E8F0; vertical-align: top; }
tr { break-inside: avoid; }
tbody tr:nth-child(even) td { background: #F8FAFC; }
td:first-child { font-weight: 600; color: #14284B; }
table.ids td:first-child { white-space: nowrap; }
.lbl-bg { fill: #ffffff; fill-opacity: .92; }

.pill { display: inline-block; padding: .3mm 2mm; border-radius: 3mm; font-size: 7.4pt; font-weight: 700; white-space: nowrap; }
.p0 { background: #14284B; color: #fff; } .p1 { background: #2F5D9E; color: #fff; }
.p2 { background: #CCFBF1; color: #0F5E55; } .p3 { background: #FEF3C7; color: #92400E; }
.sev-h { background: #FFEDD5; color: #9A3412; }
.sev-c { background: #FEE2E2; color: #991B1B; } .sev-w { background: #FEF3C7; color: #92400E; } .sev-i { background: #E0F2FE; color: #075985; }

figure.fig { margin: 4mm 0 6mm; break-inside: avoid; padding: 4mm 4mm 2mm; border: 1px solid #E2E8F0; border-radius: 3mm; background: #fff; }
figure.fig svg { width: 100%; height: auto; display: block; }
figcaption { text-align: center; font-size: 8.3pt; color: #64748B; margin-top: 2.5mm; font-style: italic; }

/* ---------- SVG visual system ---------- */
svg.figure text { font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif; }
.tb { fill: #0F172A; font-weight: 650; }
.ts { fill: #475569; }
.tw { fill: #fff; font-weight: 650; }
.tw2 { fill: #CBD5E1; }
.tl { font-size: 10.5px; font-weight: 800; letter-spacing: .09em; fill: #64748B; }
.tl-r { fill: #DC2626; } .tl-t { fill: #0F9D8A; } .tl-a { fill: #B45309; }
.tr { fill: #B91C1C; } .tt { fill: #0F9D8A; font-weight: 600; } .ta { fill: #B45309; }
.tq { font-size: 9.5px; font-weight: 700; letter-spacing: .08em; fill: #94A3B8; }
.tax { font-size: 12px; font-weight: 700; fill: #14284B; }
.tpill { font-size: 9px; font-weight: 700; fill: #0F172A; }
.tmono { font-family: 'SF Mono', Menlo, monospace !important; font-size: 10.2px; fill: #334155; }
.tkey { font-weight: 700; fill: #14284B; }
.tcard { font-size: 10px; fill: #0F9D8A; font-weight: 700; text-anchor: middle; }

.box { fill: #fff; stroke: #CBD5E1; stroke-width: 1.4; }
.box-navy { fill: #14284B; stroke: #14284B; }
.box-navyl { fill: #EEF2FA; stroke: #9DB0D4; stroke-width: 1.4; }
.box-teal { fill: #E9F7F4; stroke: #0F9D8A; stroke-width: 1.4; }
.box-amber { fill: #FFFBEB; stroke: #D97706; stroke-width: 1.4; stroke-dasharray: 6 4; }
.box-cond { fill: #fff; stroke: #D97706; stroke-width: 1.6; stroke-dasharray: 5 3.5; }
.box-red { fill: #FEF2F2; stroke: #DC2626; stroke-width: 1.4; }
.box-gray { fill: #F1F5F9; stroke: #94A3B8; stroke-width: 1.4; }
.box-todo { fill: #E9F7F4; stroke: #5EB8AC; stroke-width: 1.4; }
.card { fill: #fff; stroke: #CBD5E1; stroke-width: 1.3; }
.num { fill: #14284B; }
.dia { fill: #FEF3C7; stroke: #D97706; stroke-width: 1.5; }
.bar { fill: #14284B; }
.done { fill: #16A34A; }
.ms { fill: #0F9D8A; stroke: #fff; stroke-width: 1.5; }
.pill-teal { fill: #CCFBF1; } .pill-navy { fill: #DCE4F2; } .pill-amber { fill: #FDE68A; }
.pill-teal-solid { fill: #0F9D8A; }
rect.pill-navy + text.tw { fill: #14284B; }
.lane-a { fill: #F8FAFC; stroke: #E2E8F0; } .lane-b { fill: #fff; stroke: #E2E8F0; }
.lane-h { fill: #EEF2FA; stroke: #E2E8F0; } .lane-h-sys { fill: #F1F5F9; stroke: #E2E8F0; }
.ent-h { fill: #14284B; }
.c-add { fill: #16A34A; } .c-rem { fill: #DC2626; } .c-mod { fill: #D97706; } .c-modb { fill: #3B82F6; }
.q-hi { fill: #ECFDF8; } .frame { fill: none; stroke: #CBD5E1; }
.pt { fill: #94A3B8; } .pt-c { fill: #2F5D9E; } .pt-r { fill: #DC2626; } .pt-target { fill: #0F9D8A; stroke: #99F6E4; stroke-width: 5; }
.bound-t { fill: none; stroke: #0F9D8A; stroke-width: 1.4; stroke-dasharray: 7 5; }
.bound-a { fill: #FFFDF5; stroke: #D97706; stroke-width: 1.4; stroke-dasharray: 7 5; }
.zone-t { fill: #F2FBF9; stroke: #B7E4DC; } .zone-a { fill: #FFFBEF; stroke: #F5D9A6; }
.ph0 { fill: #64748B; } .ph1 { fill: #14284B; } .ph2 { fill: #2F5D9E; } .ph3 { fill: #0F9D8A; } .ph4 { fill: #0B6E63; }

.ln { fill: none; stroke: #64748B; stroke-width: 1.6; marker-end: url(#ah); }
.ln2 { fill: none; stroke: #64748B; stroke-width: 1.6; marker-end: url(#ah); marker-start: url(#ahs); }
.ln-t { fill: none; stroke: #0F9D8A; stroke-width: 1.8; marker-end: url(#ah-t); }
.ln-a { fill: none; stroke: #D97706; stroke-width: 1.6; stroke-dasharray: 5 4; marker-end: url(#ah-a); }
.plain { fill: none; stroke: #64748B; stroke-width: 1.6; }
.dash { stroke-dasharray: 5 4; }
.life { stroke: #94A3B8; stroke-width: 1.2; stroke-dasharray: 4 4; fill: none; }
.grid { stroke: #CBD5E1; stroke-dasharray: 4 4; fill: none; }
.grid-m { stroke: #E2E8F0; fill: none; }
.er { fill: none; stroke: #0F9D8A; stroke-width: 1.5; }
"""

MARKERS = """<svg width="0" height="0" style="position:absolute"><defs>
<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748B"/></marker>
<marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748B"/></marker>
<marker id="ah-t" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0F9D8A"/></marker>
<marker id="ah-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#D97706"/></marker>
</defs></svg>"""

FIG_RE = re.compile(r"<!-- figure: (\w+) -->\s*```mermaid\n.*?```\s*\n\*(Figure[^*]+)\*", re.S)


def md_to_html(text):
    return markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])


def decorate(html):
    html = re.sub(r"<table>(\s*<thead>\s*<tr>\s*<th>(?:ID|#)</th>)", r'<table class="ids">\1', html)
    pills = {"P0": "p0", "P1": "p1", "P2": "p2", "P3": "p3", "Critical": "sev-c", "Warning": "sev-w", "Info": "sev-i",
             "High": "sev-h", "Medium": "sev-w", "Low": "sev-i"}
    for k, cls in pills.items():
        html = html.replace(f"<td>{k}</td>", f'<td><span class="pill {cls}">{k}</span></td>')
    return html


def build():
    src = MD.read_text(encoding="utf-8")
    head, body = src.split("<!-- pdf:body-start -->", 1)

    # cover metadata from the head table
    meta = dict(re.findall(r"^\| \*\*(.+?)\*\* \| (.+?) \|$", head, re.M))
    clean = lambda s: re.sub(r"[*`]", "", s)
    meta_rows = "".join(f"<div>{k}</div><div>{clean(meta.get(k, ''))}</div>" for k in ["Version", "Date", "Owner", "Status"])
    cover = f"""<section class="cover">
      <div class="eyebrow">Product Requirements Document</div>
      <h1>BPMap<br/><span>for Workday</span></h1>
      <div class="tag">See, simulate and govern Workday business processes — privately, in the browser.</div>
      <div class="bar"></div>
      <div class="meta">{meta_rows}<div>Scope</div><div>MVP → Parity → Differentiation → Team &amp; Enterprise (24 weeks)</div></div>
      {cover_art()}
      <div class="foot">Workday® is a trademark of Workday, Inc. BPMap is an independent product and is not affiliated with, endorsed or sponsored by Workday, Inc. Working product name.</div>
    </section>"""

    # document control page: head minus H1 + tagline
    head_md = re.sub(r"^# .*\n", "", head, count=1, flags=re.M)
    head_md = re.sub(r"^\*\*See, simulate.*\*\*\n", "", head_md, count=1, flags=re.M)
    control_html = decorate(md_to_html(head_md))

    # figures
    n_figs = 0

    def fig_sub(m):
        nonlocal n_figs
        n_figs += 1
        key, cap = m.group(1), m.group(2).strip()
        return f'\n<figure class="fig">{FIGURES[key]()}<figcaption>{cap}</figcaption></figure>\n'

    body = FIG_RE.sub(fig_sub, body)
    leftover = body.count("```mermaid")
    body_html = decorate(md_to_html(body))

    # h2 ids, page breaks, TOC
    toc = []

    def h2_sub(m):
        title = m.group(1)
        sid = re.sub(r"[^a-z0-9]+", "-", re.sub(r"<.*?>", "", title).lower()).strip("-")
        num_m = re.match(r"(\d+\.|Appendix [A-Z])\s*(?:—\s*)?(.*)", title)
        num, label = (num_m.group(1), num_m.group(2)) if num_m else ("", title)
        toc.append(f'<li><a href="#{sid}"><span class="num">{num.rstrip(".") if num[0].isdigit() else ""}</span>{label if num[0].isdigit() else title}</a></li>')
        cls = ' class="pb"' if num in PAGE_BREAK_BEFORE else ""
        return f'<h2 id="{sid}"{cls}>{title}</h2>'

    body_html = re.sub(r"<h2>(.*?)</h2>", h2_sub, body_html)
    control = f"""<section class="control"><h2 class="plain">Document control</h2>{control_html}
      <h2 class="plain" style="margin-top:8mm">Contents</h2><ul class="toc">{''.join(toc)}</ul></section>"""

    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BPMap for Workday — PRD v1.0</title>
    <style>{CSS}</style></head><body>{MARKERS}{cover}{control}<main>{body_html}</main></body></html>"""
    HTML_OUT.write_text(html, encoding="utf-8")

    with tempfile.TemporaryDirectory() as prof:
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run", f"--user-data-dir={prof}",
                        "--no-pdf-header-footer", "--virtual-time-budget=4000", f"--print-to-pdf={PDF_OUT}",
                        HTML_OUT.as_uri()], check=True, capture_output=True, timeout=180)
    print(f"figures embedded: {n_figs}  leftover mermaid blocks: {leftover}")
    print(f"HTML: {HTML_OUT}\nPDF:  {PDF_OUT}")
    return 0 if leftover == 0 else 1


if __name__ == "__main__":
    sys.exit(build())
