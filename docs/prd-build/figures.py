"""SVG figure generators for the BPMap PRD (rendered into the PDF build).

Each fig_* function returns an inline <svg> string. Styling comes from the
classes defined in build_prd.py's CSS so every figure shares one visual system.
"""
from html import escape

NAVY, TEAL, AMBER, RED, SLATE = "#14284B", "#0F9D8A", "#D97706", "#DC2626", "#64748B"


# ---------------------------------------------------------------- primitives
def wrap(text, width_px, size, bold=False):
    if not text:
        return []
    max_chars = max(4, int(width_px / (size * (0.60 if bold else 0.54))))
    lines, cur = [], ""
    for word in text.split():
        if len(cur) + len(word) + (1 if cur else 0) <= max_chars:
            cur = f"{cur} {word}" if cur else word
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


DEFAULT_SIZE = {"tb": 12, "ts": 11, "tw": 12, "tw2": 10.5}


def t(x, y, s, cls="ts", anchor="middle", extra=""):
    # Presentation attributes lose to CSS, so sizes live here (not in the stylesheet) for these classes.
    if "font-size" not in extra:
        size = next((DEFAULT_SIZE[c] for c in cls.split() if c in DEFAULT_SIZE), None)
        if size:
            extra += f' font-size="{size}"'
    return f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}" {extra}>{escape(s)}</text>'


def box(x, y, w, h, title="", sub="", kind="box", rx=8, tsize=12.5, ssize=10.5, pad=10, anchor="middle"):
    dark = kind in ("box-navy",)
    tcls, scls = ("tw", "tw2") if dark else ("tb", "ts")
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" class="{kind}"/>']
    tl, sl = wrap(title, w - 2 * pad, tsize, True), wrap(sub, w - 2 * pad, ssize)
    lht, lhs = tsize * 1.22, ssize * 1.3
    gap = 4 if tl and sl else 0
    total = len(tl) * lht + len(sl) * lhs + gap
    cy = y + h / 2 - total / 2
    tx = x + w / 2 if anchor == "middle" else x + pad
    for ln in tl:
        cy += lht
        out.append(t(tx, cy - lht * 0.22, ln, tcls, anchor, f'font-size="{tsize}"'))
    cy += gap
    for ln in sl:
        cy += lhs
        out.append(t(tx, cy - lhs * 0.25, ln, scls, anchor, f'font-size="{ssize}"'))
    return "".join(out)


def ln(d, cls="ln"):
    return f'<path d="{d}" class="{cls}"/>'


def diamond(cx, cy, hw, hh, label, kind="dia", tsize=11):
    pts = f"{cx},{cy-hh} {cx+hw},{cy} {cx},{cy+hh} {cx-hw},{cy}"
    lines = wrap(label, hw * 1.3, tsize, True)
    out = [f'<polygon points="{pts}" class="{kind}"/>']
    y0 = cy - (len(lines) - 1) * tsize * 0.6 + tsize * 0.35
    for i, l in enumerate(lines):
        out.append(t(cx, y0 + i * tsize * 1.2, l, "tb", "middle", f'font-size="{tsize}"'))
    return "".join(out)


def pill(x, y, w, h, label, kind="pill-teal", cls="tpill"):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h/2}" class="{kind}"/>' + t(x + w / 2, y + h * 0.7, label, cls)


def svg(w, h, body, label):
    return (f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" class="figure" role="img" '
            f'aria-label="{escape(label)}">{body}</svg>')


# ---------------------------------------------------------------- figures
def fig_positioning():
    b = []
    X0, X1, Y0, Y1 = 150, 950, 25, 365
    mx, my = (X0 + X1) / 2, (Y0 + Y1) / 2
    b.append(f'<rect x="{mx}" y="{Y0}" width="{X1-mx}" height="{my-Y0}" class="q-hi"/>')
    b.append(f'<rect x="{X0}" y="{Y0}" width="{X1-X0}" height="{Y1-Y0}" class="frame"/>')
    b.append(ln(f"M{mx},{Y0} V{Y1}", "grid")); b.append(ln(f"M{X0},{my} H{X1}", "grid"))
    for (x, y, s, a) in [(X0 + 12, Y0 + 20, "DEEP BUT RIGID", "start"), (X1 - 12, Y0 + 20, "TARGET ZONE", "end"),
                         (X0 + 12, Y1 - 12, "MANUAL / STATIC", "start"), (X1 - 12, Y1 - 12, "FLEXIBLE BUT SHALLOW", "end")]:
        b.append(t(x, y, s, "tq", a))
    b.append(t((X0 + X1) / 2, Y1 + 34, "Input flexibility  →", "tax"))
    b.append(t(X0, Y1 + 18, "Structured export only", "ts", "start"))
    b.append(t(X1, Y1 + 18, "Any input (exports, screenshots, scans)", "ts", "end"))
    b.append(f'<text transform="translate(60,{my}) rotate(-90)" class="tax" text-anchor="middle">Depth beyond the diagram  →</text>')
    b.append(f'<text transform="translate(128,{Y1}) rotate(-90)" class="ts" text-anchor="start">Picture only</text>')
    b.append(f'<text transform="translate(128,{Y0}) rotate(-90)" class="ts" text-anchor="end">Tests, controls, governance</text>')
    P = lambda fx, fy: (X0 + fx * (X1 - X0), Y1 - fy * (Y1 - Y0))
    pts = [("Workday grid view", .10, .22, "pt"), ("Manual Visio / draw.io", .30, .12, "pt"),
           ("Incubane BP Visualizer", .24, .52, "pt-c"), ("BPM suites (Signavio, ARIS)", .38, .80, "pt"),
           ("Prototype v0", .72, .18, "pt-r")]
    for name, fx, fy, cls in pts:
        x, y = P(fx, fy)
        b.append(f'<circle cx="{x}" cy="{y}" r="8" class="{cls}"/>' + t(x + 14, y + 4, name, "tb", "start", 'font-size="12"'))
    vx, vy = P(.72, .18); tx, ty = P(.82, .86)
    b.append(ln(f"M{vx+4},{vy-10} L{tx-6},{ty+16}", "ln-t dash"))
    b.append(t((vx + tx) / 2 + 52, (vy + ty) / 2, "Phases 1–4", "tt", "start"))
    b.append(f'<circle cx="{tx}" cy="{ty}" r="13" class="pt-target"/>' + t(tx + 20, ty + 5, "BPMap (target)", "tb", "start", 'font-size="13.5"'))
    return svg(1000, 410, "".join(b), "Competitive positioning map")


def fig_asis_tobe():
    b = []
    xs, w = [20, 219, 418, 617, 816], 164
    b.append(t(20, 26, "TODAY — PROTOTYPE v0", "tl tl-r", "start"))
    row1 = [("Screenshot / PDF", "of the Steps table", "box"), ("Gemini 2.5 Flash", "cloud call; API key in the browser", "box-red"),
            ("Flat JSON", "10 string fields; no runtime validation", "box"), ("Linear layout", "array order; 'No' drawn as restart", "box-red"),
            ("PNG export", "visible viewport only", "box-red")]
    for x, (ti, su, k) in zip(xs, row1):
        b.append(box(x, 38, w, 70, ti, su, k))
    for i in range(4):
        b.append(ln(f"M{xs[i]+w},73 H{xs[i+1]-2}"))
    b.append(t(20, 132, "✕ Tenant data leaves the browser     ✕ Wrong condition semantics     ✕ Parallel steps lost     ✕ No persistence or editable exports", "ts tr", "start"))
    b.append(t(20, 178, "TARGET — v1 AND BEYOND", "tl tl-t", "start"))
    b.append(t(980, 178, "● Runs entirely in the user's browser", "ts tt", "end"))
    b.append('<rect x="10" y="186" width="980" height="98" rx="12" class="bound-t"/>')
    row2 = [("Workday XLSX export", "Steps + Notifications sheets", "box-teal"), ("Local parser", "in-browser, deterministic", "box"),
            ("Canonical model", "zod-validated; stable step IDs", "box-navy"), ("Engines", "layout · scenario · health · diff", "box"),
            ("Views & deliverables", "3 views · PDF · PPTX · BPMN", "box-teal")]
    for x, (ti, su, k) in zip(xs, row2):
        b.append(box(x, 200, w, 70, ti, su, k))
    for i in range(4):
        b.append(ln(f"M{xs[i]+w},235 H{xs[i+1]-2}"))
    b.append(box(20, 318, w, 58, "Screenshot / PDF", "fallback input", "box-gray"))
    b.append(box(219, 318, w, 58, "AI importer", "opt-in · redacted · verify table", "box-amber"))
    b.append(box(617, 318, 363, 58, "AI Assist (opt-in)", "plain-English conditions · SOPs · test narratives · change summaries · Q&A", "box-amber"))
    b.append(ln("M184,347 H217", "ln-a"))
    b.append(ln("M383,347 H462 V273", "ln-a"))
    b.append(ln("M540,270 V347 H615", "ln-a"))
    return svg(1000, 392, "".join(b), "Current pipeline versus target pipeline")


def fig_journey():
    b = []
    xs, W, H = [20, 266, 512, 758], 222, 112
    steps = [
        ("Get the export", "View Definition → Export to Excel. In-app guide shows how.", "In Workday", False),
        ("Import", "Drop the definition, subprocesses and notifications exports.", "Browser", False),
        ("Validate", "Parse report: rows read, warnings, column mapping if needed.", "Browser", True),
        ("Explore", "Executive, Process owner or Configurator view; focus a role.", "Browser", False),
        ("Simulate", "Answer conditions; skipped steps disappear; save presets.", "Browser", True),
        ("Review", "Health check flags SoD, gaps and slow paths, with fixes.", "Browser", True),
        ("Customise", "Lane names, plain-word conditions, notes, systems. Survives re-import.", "Browser", True),
        ("Deliver", "PDF, PPTX, draw.io, BPMN, test plan, controls matrix, share link.", "Browser / Cloud", True),
    ]
    for i, (ti, de, tag, ai) in enumerate(steps):
        x, y = xs[i % 4], 18 if i < 4 else 196
        b.append(f'<rect x="{x}" y="{y}" width="{W}" height="{H}" rx="10" class="card"/>')
        b.append(f'<circle cx="{x+24}" cy="{y+25}" r="13" class="num"/>' + t(x + 24, y + 29.5, str(i + 1), "tw", "middle", 'font-size="12.5"'))
        b.append(t(x + 46, y + 30, ti, "tb", "start", 'font-size="14"'))
        for j, l in enumerate(wrap(de, W - 28, 10.8)):
            b.append(t(x + 14, y + 56 + j * 14, l, "ts", "start", 'font-size="10.8"'))
        tw = 9 + len(tag) * 6.2
        b.append(pill(x + 12, y + H - 24, tw, 16, tag, "pill-navy" if tag == "In Workday" else "pill-teal", "tpill"))
        if ai:
            b.append(pill(x + W - 84, y + H - 24, 72, 16, "AI optional", "pill-amber", "tpill"))
        if i % 4 < 3:
            b.append(ln(f"M{x+W},{y+H/2} H{xs[i%4+1]-2}"))
    b.append(ln("M869,130 V163 H131 V194"))
    b.append(t(500, 336, "Browser = data stays local by default  ·  AI optional = opt-in and redacted, with a preview of exactly what is sent (§12)", "ts", "middle"))
    return svg(1000, 346, "".join(b), "End-to-end user workflow")


def fig_architecture():
    b = []
    b.append('<rect x="185" y="30" width="602" height="515" rx="14" class="bound-t"/>')
    b.append(t(201, 52, "USER'S BROWSER — DEFAULT DATA BOUNDARY", "tl tl-t", "start"))
    b.append('<rect x="805" y="30" width="185" height="515" rx="14" class="bound-a"/>')
    b.append(t(820, 52, "CLOUD — OPT-IN", "tl tl-a", "start"))
    b.append(t(20, 52, "INPUTS", "tl", "start"))
    ins = [("Workday BP export", ".xlsx", "box-teal"), ("Subprocess exports", ".xlsx", "box-teal"),
           ("Condition-rule report", "Phase 3", "box"), ("BP security policy", "Phase 3", "box"),
           ("Screenshot / PDF", "opt-in AI only", "box-amber"), (".bpmap project file", "save / share", "box")]
    for i, (ti, su, k) in enumerate(ins):
        y = 70 + i * 62
        b.append(box(20, y, 150, 50, ti, su, k, tsize=11.5, ssize=10))
        b.append(ln(f"M170,{y+25} H178", "plain"))
    b.append(ln("M178,95 V405", "plain")); b.append(ln("M178,165 H203"))
    imps = [("XLSX parser", "Web Worker", "box"), ("Column mapper", "saved profiles", "box"),
            ("Project loader", "schema migrations", "box"), ("AI vision importer", "opt-in · verify table", "box-amber")]
    b.append(t(205, 70, "", "ts"))
    for i, (ti, su, k) in enumerate(imps):
        b.append(box(205, 72 + i * 66, 150, 54, ti, su, k, tsize=12, ssize=10))
    b.append(ln("M355,130 H378"))
    b.append(box(380, 72, 190, 120, "Canonical model", "steps · conditions · groups · notifications · subprocess refs; zod-validated, stable IDs", "box-navy", tsize=14))
    b.append(box(380, 210, 190, 54, "Overlay store", "labels · notes · wording · systems", "box-teal", tsize=12, ssize=10))
    b.append(box(380, 282, 190, 54, "Local library", "IndexedDB · autosave", "box", tsize=12, ssize=10))
    b.append(ln("M475,194 V208", "ln2")); b.append(ln("M475,266 V280", "ln2"))
    b.append(ln("M570,130 H593"))
    for i, ti in enumerate(["Graph builder", "Layout (ELK.js)", "Scenario engine", "Health & controls rules", "Diff engine"]):
        b.append(box(595, 72 + i * 56, 172, 46, ti, "", "box", tsize=12))
    b.append(ln("M681,342 V370"))
    b.append(box(205, 372, 562, 56, "Canvas & panels", "Executive · Process owner · Configurator · Scenario · Health · Step · Customise", "box-navyl", tsize=13))
    b.append(ln("M486,428 V444"))
    b.append(box(205, 446, 562, 56, "Exporters", "PDF · PPTX · SVG / PNG · draw.io · Mermaid · BPMN 2.0 · XLSX (test plan, controls matrix)", "box-teal", tsize=13))
    b.append(box(820, 72, 155, 84, "AI gateway", "auth · rate limit · redaction check · zero retention", "box-amber", tsize=12.5, ssize=10))
    b.append(box(820, 176, 155, 50, "LLM provider", "Claude / Gemini", "box-gray", tsize=12, ssize=10))
    b.append(ln("M897,156 V174", "ln-a"))
    b.append(box(820, 300, 155, 96, "Team services", "workspace · versions · share links · comments · SSO (Phase 4)", "box", tsize=12.5, ssize=10))
    b.append(ln("M520,72 V48 H800 V100 H818", "ln-a"))
    b.append(t(690, 41, "redacted payload, after consent", "ts ta", "middle", 'font-size="10.5"'))
    b.append(ln("M570,309 H583 V357 H818", "ln-a"))
    b.append(t(740, 351, "sync (Phase 4)", "ts ta", "middle", 'font-size="10.5"'))
    b.append(t(500, 534, "Overlays never modify the canonical model · everything derived (layout, findings, diffs, test plans) is recomputed", "ts", "middle"))
    return svg(1000, 552, "".join(b), "Logical architecture and trust boundaries")


def fig_import():
    b = []
    b.append(pill(420, 8, 160, 34, "Files dropped", "pill-navy", "tw"))
    b.append(ln("M500,42 V56"))
    b.append(diamond(500, 86, 74, 29, "File type?"))
    b.append(ln("M426,86 H200 V128")); b.append(t(300, 80, "XLSX", "tb ts", "middle"))
    b.append(ln("M500,115 V128")); b.append(t(530, 124, ".bpmap", "ts", "start"))
    b.append(ln("M574,86 H760 V120")); b.append(t(668, 80, "Image / PDF", "ts", "middle"))
    L = [("Detect sheets", "Steps + Notifications (by headers)"), ("Map columns", "automatic; manual dialog as fallback"),
         ("Normalise rows", "order, kind, groups, C-numbers, flags")]
    for i, (ti, su) in enumerate(L):
        y = 130 + i * 58
        b.append(box(90, y, 220, 44, ti, su, "box-teal", tsize=12, ssize=10))
        if i < 2:
            b.append(ln(f"M200,{y+44} V{y+56}"))
    b.append(box(400, 130, 200, 44, "Read project file", ".bpmap.json + migrations", "box", tsize=12, ssize=10))
    b.append(ln("M500,174 V186"))
    b.append(box(400, 188, 200, 44, "Restore model + overlays", "", "box", tsize=12))
    b.append(diamond(760, 150, 80, 28, "AI importer on?"))
    b.append(ln("M840,150 H878")); b.append(t(858, 143, "No", "ts", "middle"))
    b.append(box(880, 128, 110, 44, "Show export guide", "", "box-gray", tsize=11))
    b.append(ln("M760,178 V196")); b.append(t(772, 191, "Yes", "ts", "start"))
    R = [("Redaction preview + consent", "box-amber"), ("AI extraction", "box-amber"), ("Human verification table", "box")]
    for i, (ti, k) in enumerate(R):
        y = 198 + i * 54
        b.append(box(650, y, 220, 40, ti, "", k, tsize=12))
        if i < 2:
            b.append(ln(f"M760,{y+40} V{y+52}"))
    b.append(ln("M200,290 V392 H378")); b.append(ln("M500,232 V368")); b.append(ln("M760,346 V392 H622"))
    b.append(box(380, 370, 240, 44, "Build canonical model", "stable step IDs", "box-navy", tsize=12.5, ssize=10))
    b.append(ln("M500,414 V428"))
    b.append(box(380, 430, 240, 44, "Validate + parse report", "zod schema · Workday rules · warnings", "box", tsize=12, ssize=10))
    b.append(ln("M500,474 V486"))
    b.append(pill(400, 488, 200, 34, "Render Process-owner view", "pill-teal-solid", "tw"))
    return svg(1000, 530, "".join(b), "Import and parsing pipeline")


def fig_notation():
    b = []
    lanes = ["Initiator", "Manager", "HR Partner", "Compensation Partner", "Workday (automatic)"]
    top, lh = 40, 60
    cols = [("Step a", 230), ("Step b", 390), ("Step c · 2 in parallel", 550), ("Step d", 760), ("Step e", 905)]
    for i, name in enumerate(lanes):
        y = top + i * lh
        b.append(f'<rect x="20" y="{y}" width="960" height="{lh}" class="{"lane-a" if i % 2 == 0 else "lane-b"}"/>')
        b.append(f'<rect x="20" y="{y}" width="118" height="{lh}" class="lane-h{"-sys" if i == 4 else ""}"/>')
        for j, l in enumerate(wrap(name, 105, 11, True)):
            b.append(t(30, y + lh / 2 + 4 - (len(wrap(name, 105, 11, True)) - 1) * 7 + j * 14, l, "tb", "start", 'font-size="11"'))
    for name, cx in cols:
        b.append(t(cx, 30, name, "ts", "middle"))
    cy = lambda i: top + i * lh + lh / 2
    b.append(box(160, cy(0) - 22, 140, 44, "Initiate Change Job", "START", "box-navy", rx=6, tsize=10.5, ssize=9, pad=6))
    b.append(box(320, cy(1) - 22, 140, 44, "Review: Current Mgr", "Action", "box-cond", rx=6, tsize=10.5, ssize=9, pad=6))
    b.append(pill(440, cy(1) - 29, 28, 14, "C1", "pill-amber", "tpill"))
    b.append(ln(f"M300,{cy(0)} H310 V{cy(1)} H318"))
    b.append(ln(f"M460,{cy(1)} H475 V{cy(2)-17}", "plain"))
    b.append(f'<rect x="472" y="{cy(2)-18}" width="6" height="{cy(3)-cy(2)+36}" rx="2" class="bar"/>')
    b.append(box(487, cy(2) - 23, 128, 46, "Change Org Assignments", "Action", "box-cond", rx=6, tsize=10, ssize=9, pad=5))
    b.append(pill(595, cy(2) - 30, 28, 14, "C2", "pill-amber", "tpill"))
    b.append(box(487, cy(3) - 23, 128, 46, "Propose Compensation", "Action", "box", rx=6, tsize=10, ssize=9, pad=5))
    b.append(ln(f"M478,{cy(2)} H485")); b.append(ln(f"M478,{cy(3)} H485"))
    b.append(f'<rect x="626" y="{cy(2)-18}" width="6" height="{cy(3)-cy(2)+36}" rx="2" class="bar"/>')
    b.append(ln(f"M615,{cy(2)} H624", "plain")); b.append(ln(f"M615,{cy(3)} H624", "plain"))
    b.append(ln(f"M629,{cy(2)-18} V{cy(1)} H648"))
    b.append(diamond(668, cy(1), 19, 19, "C3?", tsize=10))
    b.append(ln(f"M687,{cy(1)} H698")); b.append(t(684, cy(1) - 10, "Yes", "ts", "end", 'font-size="9.5"'))
    b.append(box(700, cy(1) - 20, 120, 40, "Approve", "Manager", "box-navy", rx=6, tsize=11.5, ssize=9))
    b.append(ln(f"M668,{cy(1)+19} V{cy(4)} H843", "ln dash"))
    b.append(t(745, cy(4) - 6, "No, skip", "ts", "middle", 'font-size="10"'))
    b.append(ln(f"M820,{cy(1)} H905 V{cy(4)-22}"))
    b.append(box(845, cy(4) - 20, 120, 40, "Remove invalid time off", "", "box-gray", rx=6, tsize=10, pad=6))
    b.append(f'<circle cx="972" cy="{cy(4)-20}" r="8" class="done"/>' + t(972, cy(4) - 16.5, "✓", "tw", "middle", 'font-size="10"'))
    # legend
    ly = 362
    b.append(t(20, ly - 8, "LEGEND", "tl", "start"))
    items = [("box-navy", "Approval / initiation"), ("box", "Action or review"), ("box-todo", "To do"), ("box-gray", "Workday service / integration"),
             ("box-cond", "Runs only if condition true (Cn)"), ("dia", "Decision: Yes runs, No skips"), ("bar", "Parallel split / join"), ("done", "Process complete")]
    for i, (k, lab) in enumerate(items):
        x, y = 20 + (i % 4) * 245, ly + (i // 4) * 30
        if k == "dia":
            b.append(diamond(x + 14, y + 9, 10, 10, "", kind="dia"))
        elif k == "bar":
            b.append(f'<rect x="{x+10}" y="{y-2}" width="6" height="22" rx="2" class="bar"/>')
        elif k == "done":
            b.append(f'<circle cx="{x+14}" cy="{y+9}" r="8" class="done"/>')
        else:
            b.append(f'<rect x="{x}" y="{y}" width="30" height="18" rx="4" class="{k}"/>')
        b.append(t(x + 40, y + 13, lab, "ts", "start", 'font-size="11"'))
    b.append(t(20, ly + 74, "Exceptions are not drawn: at an approval or action the person can send back or deny, and allowed roles can cancel, rescind or correct (set in the BP security policy).", "ts", "start", 'font-size="10.5"'))
    return svg(1000, 448, "".join(b), "Notation reference diagram")


def fig_scenario():
    b = []
    xs, w = [20, 222, 424, 626, 828], 168
    items = [("Conditions C1…Cn", "from the export; Workday- or customer-owned", "box-gray"),
             ("Answer each condition", "Yes · No · Not set — or load a saved preset", "box"),
             ("Evaluate", "a step runs unless one of its conditions is No", "box"),
             ("Prune", "hide skipped steps; collapse empty lanes and stages", "box"),
             ("Path view", "diagram, preset and export for this one case", "box-teal")]
    for x, (ti, su, k) in zip(xs, items):
        b.append(box(x, 20, w, 82, ti, su, k))
    for i in range(4):
        b.append(ln(f"M{xs[i]+w},61 H{xs[i+1]-2}"))
    b.append(ln("M104,102 V185 H220"))
    b.append(box(222, 150, 370, 72, "Test-plan generator", "pairwise combinations of the relevant conditions; capped and reported so it stays readable", "box-navyl"))
    b.append(ln("M592,186 H624"))
    b.append(box(626, 150, 370, 72, "Test plan (XLSX)", "one case per path: steps that run, expected approver groups, due dates, pass/fail column", "box-teal"))
    return svg(1000, 236, "".join(b), "Scenario simulation and test-plan generation")


def fig_ai_sequence():
    b = []
    b.append('<rect x="12" y="8" width="586" height="500" rx="12" class="zone-t"/>')
    b.append('<rect x="608" y="8" width="380" height="500" rx="12" class="zone-a"/>')
    b.append(t(24, 500, "IN THE BROWSER", "tl tl-t", "start")); b.append(t(620, 500, "CLOUD (OPT-IN)", "tl tl-a", "start"))
    lx = [95, 300, 505, 705, 900]
    heads = [("User", "box-teal"), ("Browser app", "box-navy"), ("Redaction engine", "box"), ("AI gateway", "box-amber"), ("LLM provider", "box-gray")]
    for x, (n, k) in zip(lx, heads):
        b.append(box(x - 75, 20, 150, 38, n, "", k, tsize=12.5))
        b.append(ln(f"M{x},58 V480", "life"))
    msgs = [(0, 1, "1 · Request, e.g. an SOP", False),
            (1, 2, "2 · Model slice (no raw file)", False),
            (2, 1, "3 · Tokenised payload", True),
            (1, 0, "4 · Preview exact payload", False),
            (0, 1, "5 · Consent", False),
            (1, 3, "6 · Redacted prompt + task template", False),
            (3, 4, "7 · Zero-retention API call", False),
            (4, 3, "8 · Draft (JSON schema)", True),
            (3, 1, "9 · Validated response + usage log (metadata only)", True)]
    y = 94
    for a, c, lab, ret in msgs:
        x1, x2 = lx[a], lx[c]
        d = 1 if x2 > x1 else -1
        b.append(ln(f"M{x1},{y} H{x2 - d*3}", "ln dash" if ret else "ln"))
        lw = len(lab) * 6.3 + 12
        mx = (x1 + x2) / 2
        b.append(f'<rect x="{mx-lw/2:.1f}" y="{y-21}" width="{lw:.1f}" height="16" rx="4" class="lbl-bg"/>')
        b.append(t(mx, y - 9, lab, "ts", "middle", 'font-size="11.5"'))
        y += 40
    b.append(ln(f"M300,{y} H340 V{y+22} H303", "ln"))
    b.append(f'<rect x="346" y="{y-6}" width="262" height="34" rx="4" class="lbl-bg"/>')
    b.append(t(352, y + 7, "10 · Re-hydrate tokens locally; show as an", "ts", "start", 'font-size="11.5"'))
    b.append(t(352, y + 22, "editable AI draft that writes to the overlay only", "ts", "start", 'font-size="11.5"'))
    return svg(1000, 516, "".join(b), "AI Assist sequence with redaction and consent")


def fig_diff():
    b = []
    b.append(box(20, 30, 190, 70, "Definition A", "e.g. Production · 2026R2", "box-gray"))
    b.append(box(20, 150, 190, 70, "Definition B", "e.g. Sandbox · 2027R1", "box-gray"))
    b.append(ln("M210,65 H235 V125 H258")); b.append(ln("M210,185 H235 V125", "plain"))
    b.append(box(260, 72, 205, 106, "Align steps", "stable key: order + kind + task + group; fuzzy match as fallback", "box"))
    b.append(ln("M465,125 H508"))
    b.append('<rect x="510" y="40" width="205" height="170" rx="8" class="box-navy"/>')
    b.append(t(612, 66, "Classify changes", "tw", "middle", 'font-size="13"'))
    for i, (sym, lab, cls) in enumerate([("+", "Added", "c-add"), ("−", "Removed", "c-rem"), ("~", "Modified fields", "c-modb"),
                                         ("↕", "Moved to another stage", "c-modb"), ("C", "Condition changed", "c-modb")]):
        y = 92 + i * 24
        b.append(f'<rect x="530" y="{y-13}" width="18" height="18" rx="4" class="{cls}"/>' + t(539, y, sym, "tw", "middle", 'font-size="11"'))
        b.append(t(558, y, lab, "tw2", "start", 'font-size="11.5"'))
    b.append(ln("M715,125 H737 V50 H758")); b.append(ln("M737,125 V130 H758", "ln")); b.append(ln("M737,125 V210 H758"))
    b.append(box(760, 20, 220, 60, "Visual diff overlay", "green / red / blue, always with icons", "box-teal"))
    b.append(box(760, 100, 220, 60, "Change log", "table · XLSX / PDF export", "box"))
    b.append(box(760, 180, 220, 60, "AI change summary for CAB", "opt-in · cites step IDs", "box-amber"))
    return svg(1000, 254, "".join(b), "Compare workflow")


def fig_datamodel():
    b = []

    def ent(x, y, w, name, fields):
        h = 30 + len(fields) * 17 + 8
        out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" class="box"/>',
               f'<path d="M{x},{y+7} a7,7 0 0 1 7,-7 h{w-14} a7,7 0 0 1 7,7 v23 h-{w} z" class="ent-h"/>',
               t(x + 10, y + 20, name, "tw", "start", 'font-size="12"')]
        for i, f in enumerate(fields):
            out.append(t(x + 10, y + 46 + i * 17, f, "tmono" + (" tkey" if i == 0 else ""), "start"))
        return "".join(out)

    b.append(ent(20, 30, 180, "PROJECT", ["id", "name", "createdAt", "schemaVersion"]))
    b.append(ent(260, 30, 230, "DEFINITION", ["id", "process · variant", "source: xlsx | ai", "importedAt", "contentHash", "conditions[] scope"]))
    b.append(ent(550, 30, 200, "NOTIFICATION", ["id", "trigger", "recipients[]", "isCustom"]))
    b.append(ent(790, 30, 190, "SCENARIO", ["id", "name", "answers {Cn: yes | no}"]))
    b.append(ent(20, 270, 180, "OVERLAY", ["definitionId", "laneNames {}", "labels {} · notes {}", "hidden []", "conditionWording {}", "downstreamSystems []", "dismissedFindings []"]))
    b.append(ent(260, 270, 230, "STEP", ["id: order-kind-slug", "order (a, b, f1…)", "kind", "task", "groups [] · allMustAct", "optional", "dueDate", "alternate", "routing · restriction", "complete", "conditionIds []", "subProcessRef?"]))
    b.append(ent(550, 270, 200, "CONDITION", ["id: C1…Cn", "text", "workdayOwned", "ruleLogic? (Phase 3)", "stepIds []"]))
    b.append(ent(790, 270, 190, "HEALTH_FINDING", ["ruleId", "severity", "stepIds []", "message", "suggestedFix"]))
    rel = lambda d, cls="er": f'<path d="{d}" class="{cls}"/>'
    b.append(rel("M200,80 H260")); b.append(t(230, 74, "1 : N", "tcard"))
    b.append(rel("M490,80 H550")); b.append(t(520, 74, "1 : N", "tcard"))
    b.append(rel("M450,30 V14 H885 V30")); b.append(t(668, 10, "1 : N", "tcard"))
    b.append(rel("M330,170 V270")); b.append(t(316, 222, "1 : N", "tcard", "end"))
    b.append(rel("M440,270 V170", "er dash")); b.append(t(446, 214, "subProcessRef", "tcard", "start"))
    b.append(t(446, 227, "0..1", "tcard", "start"))
    b.append(rel("M260,155 H110 V270")); b.append(t(118, 222, "1 : 1", "tcard", "start"))
    b.append(rel("M490,330 H550")); b.append(t(520, 324, "N : M", "tcard"))
    b.append(t(520, 345, "runs only if", "tcard"))
    b.append(rel("M490,160 H520 V246 H885 V270", "er dash")); b.append(t(700, 240, "derived (recomputed)", "tcard"))
    return svg(1000, 536, "".join(b), "Canonical data model")


def fig_roadmap():
    b = []
    X0, wk = 220, (980 - 220) / 24
    for name, wks in [("Dec '26", 2.14), ("Jan '27", 6.57), ("Feb '27", 11.0), ("Mar '27", 15.0), ("Apr '27", 19.43)]:
        x = X0 + wks * wk
        b.append(ln(f"M{x},36 V292", "grid-m")); b.append(t(x + 4, 30, name, "ts", "start"))
    b.append(t(X0, 30, "Nov '26", "ts", "start"))
    for w in range(1, 25, 2):
        b.append(t(X0 + (w - 0.5) * wk, 50, f"W{w}", "tq", "middle"))
    phases = [("Phase 0 · Foundation", "Week 1", 1, 1, "ph0", "Fix & rebrand"),
              ("Phase 1 · Core engine", "Weeks 2–5", 2, 5, "ph1", "IMP · MOD · VIS core"),
              ("Phase 2 · Parity+", "Weeks 6–9", 6, 9, "ph2", "Views · scenarios · PPTX"),
              ("Phase 3 · Differentiate", "Weeks 10–14", 10, 14, "ph3", "Tests · controls · compare · AI"),
              ("Phase 4 · Team & Enterprise", "Weeks 15–24", 15, 24, "ph4", "Workspace · sharing · SSO · self-host")]
    for i, (n, wks, s, e, cls, lab) in enumerate(phases):
        y = 64 + i * 44
        b.append(t(20, y + 13, n, "tb", "start", 'font-size="12"')); b.append(t(20, y + 27, wks, "ts", "start", 'font-size="10"'))
        x = X0 + (s - 1) * wk
        bw = (e - s + 1) * wk
        b.append(f'<rect x="{x+1}" y="{y}" width="{bw-2}" height="30" rx="6" class="{cls}"/>')
        if e == 24:
            b.append(t(x + 10, y + 19.5, lab, "tw", "start", 'font-size="11"'))
        else:
            b.append(t(x + bw + 8, y + 19.5, lab, "tb", "start", 'font-size="11"'))
    my = 300
    b.append(t(20, my + 4, "Milestones", "tb", "start", 'font-size="12"'))
    for w, lab, anchor in [(5, "Public beta", "middle"), (9, "Parity release", "middle"), (14, "Pro launch", "middle"), (24, "Team GA", "end")]:
        x = X0 + w * wk
        b.append(f'<polygon points="{x},{my-9} {x+9},{my} {x},{my+9} {x-9},{my}" class="ms"/>')
        b.append(t(x + (0 if anchor == "middle" else 8), my + 26, f"{lab} · W{w}", "tb", anchor, 'font-size="11"'))
    return svg(1000, 336, "".join(b), "Roadmap Gantt chart")


def cover_art():
    """Decorative swimlane motif for the cover."""
    b = []
    for i in range(5):
        y = 20 + i * 52
        b.append(f'<line x1="0" y1="{y}" x2="760" y2="{y}" stroke="#ffffff" stroke-opacity=".10"/>')
    nodes = [(40, 36, 0), (190, 88, 1), (340, 140, 1), (340, 192, 0), (520, 88, 1), (650, 244, 0)]
    for x, y, dashed in nodes:
        b.append(f'<rect x="{x}" y="{y-16}" width="100" height="32" rx="6" fill="#ffffff" fill-opacity=".07" '
                 f'stroke="{"#F59E0B" if dashed else "#5EEAD4"}" stroke-opacity=".75" stroke-width="1.5" {"stroke-dasharray=\"5 4\"" if dashed else ""}/>')
    path = "M140,36 H165 V88 H190 M290,88 H315 V140 H340 M315,140 V192 H340 M440,140 H480 V88 H520 M440,192 H480 V88 M620,88 H640 V244 H650"
    b.append(f'<path d="{path}" fill="none" stroke="#5EEAD4" stroke-opacity=".55" stroke-width="1.6"/>')
    b.append('<rect x="312" y="122" width="5" height="88" rx="2" fill="#5EEAD4" fill-opacity=".6"/>')
    return f'<svg viewBox="0 0 760 270" xmlns="http://www.w3.org/2000/svg" class="cover-art">{"".join(b)}</svg>'


FIGURES = {
    "positioning": fig_positioning, "asis_tobe": fig_asis_tobe, "journey": fig_journey,
    "architecture": fig_architecture, "import": fig_import, "notation": fig_notation,
    "scenario": fig_scenario, "ai_sequence": fig_ai_sequence, "diff": fig_diff,
    "datamodel": fig_datamodel, "roadmap": fig_roadmap,
}
