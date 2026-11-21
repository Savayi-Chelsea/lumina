"""Chapter 4 figures from the evaluation results (SVG; PNG copies via scripts/render_charts.mjs).

  .venv/bin/python scripts/evaluation_charts.py
  node scripts/render_charts.mjs        # optional: 2x PNGs for Word/PDF

Reads only files written by the evaluation scripts and draws only those numbers.
A figure whose input is missing is skipped with a message. No plotting library:
plain SVG keeps the figures dependency-free, sharp at any size and diffable.
Colours: the validated categorical order (blue, orange, aqua; all-pairs CVD-safe).
Every value drawn here also appears as a table in evaluation/EVALUATION_REPORT.md.
"""
import csv
import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESULTS = ROOT / "evaluation/results"
FIGURES = ROOT / "evaluation/figures"

SURFACE, INK, INK2, MUTED, GRID, AXIS = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]
FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"
SYSTEMS = [("semantic", "Semantic (BGE + pgvector)"), ("keyword_baseline", "Keyword (TF-IDF)"), ("hybrid", "Hybrid (BGE + BM25)")]
SYSTEMS_LONG = [("semantic", "Semantic"), ("keyword_baseline", "Keyword (TF-IDF)"), ("hybrid", "Hybrid (BGE + BM25)")]


def text(x, y, value, size=12, color=INK2, anchor="start", weight=400, extra=""):
    return (f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" fill="{color}" text-anchor="{anchor}" '
            f'font-weight="{weight}" {extra}>{escape(str(value))}</text>')


def column(x, y_top, width, baseline, color):
    """Column with a 4px rounded data end and a square baseline."""
    h = baseline - y_top
    if h <= 0:
        return ""
    r = min(4, h, width / 2)
    return (f'<path d="M{x:.1f},{baseline:.1f} V{y_top + r:.1f} Q{x:.1f},{y_top:.1f} {x + r:.1f},{y_top:.1f} '
            f'H{x + width - r:.1f} Q{x + width:.1f},{y_top:.1f} {x + width:.1f},{y_top + r:.1f} V{baseline:.1f} Z" fill="{color}"/>')


def bar(x0, y, length, height, color):
    """Horizontal bar with a 4px rounded data end."""
    if length <= 0:
        return ""
    r = min(4, length, height / 2)
    return (f'<path d="M{x0:.1f},{y:.1f} H{x0 + length - r:.1f} Q{x0 + length:.1f},{y:.1f} {x0 + length:.1f},{y + r:.1f} '
            f'V{y + height - r:.1f} Q{x0 + length:.1f},{y + height:.1f} {x0 + length - r:.1f},{y + height:.1f} H{x0:.1f} Z" fill="{color}"/>')


def legend(x, y, items):
    out, cx = [], x
    for color, label in items:
        out.append(f'<rect x="{cx:.1f}" y="{y - 9:.1f}" width="12" height="12" rx="3" fill="{color}"/>')
        out.append(text(cx + 18, y + 1, label, 12, INK2))
        cx += 34 + 7.2 * len(label)
    return "".join(out)


def svg(width, height, title, subtitle, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
            f'font-family="{FONT}" role="img" aria-label="{escape(title)}">'
            f'<rect width="{width}" height="{height}" fill="{SURFACE}"/>'
            f'{text(24, 34, title, 17, INK, weight=600)}{text(24, 56, subtitle, 12.5, INK2)}{body}</svg>')


def y_axis(x0, x1, y_of, ticks, fmt):
    out = []
    for t in ticks:
        y = y_of(t)
        out.append(f'<line x1="{x0}" x2="{x1}" y1="{y:.1f}" y2="{y:.1f}" stroke="{GRID if t else AXIS}" stroke-width="1"/>')
        out.append(text(x0 - 8, y + 4, fmt(t), 11, MUTED, "end", extra='font-variant-numeric="tabular-nums"'))
    return "".join(out)


# ---------- Figure 1: system comparison with 95% CIs ----------
def figure_comparison(report):
    metrics = [("precision_at_5", "P@5"), ("recall_at_5", "R@5"), ("f1_at_5", "F1@5"), ("reciprocal_rank", "MRR@5")]
    panels = [("all", f"All queries (n = {len(report['queries'])})"),
              ("transition", f"Career-transition queries (n = {sum(q['set'] == 'transition' for q in report['queries'])})")]
    width, height, top, bottom = 980, 450, 136, 386
    panel_w, gap = 400, 80
    body = [legend(24, 88, [(SERIES[i], label) for i, (_, label) in enumerate(SYSTEMS)])]
    has_ci = "confidence_intervals" in report
    for p, (scope, label) in enumerate(panels):
        x0 = 70 + p * (panel_w + gap)
        y_of = lambda v: bottom - v * (bottom - top)
        body.append(text(x0, top - 14, label, 13, INK, weight=600))
        body.append(y_axis(x0, x0 + panel_w, y_of, [0, 0.25, 0.5, 0.75, 1.0], lambda t: f"{t:.2f}"))
        group_w = panel_w / len(metrics)
        bar_w = 22
        for g, (key, metric_label) in enumerate(metrics):
            start = x0 + g * group_w + (group_w - (3 * bar_w + 2 * 2)) / 2
            for s, (system, _) in enumerate(SYSTEMS):
                value = report["macro"][scope][system][key]
                x = start + s * (bar_w + 2)
                body.append(column(x, y_of(value), bar_w, bottom, SERIES[s]))
                if has_ci:
                    lo, hi = report["confidence_intervals"][scope][system][key]
                    cx = x + bar_w / 2
                    body.append(f'<path d="M{cx:.1f},{y_of(hi):.1f} V{y_of(lo):.1f} M{cx - 4:.1f},{y_of(hi):.1f} H{cx + 4:.1f} '
                                f'M{cx - 4:.1f},{y_of(lo):.1f} H{cx + 4:.1f}" stroke="{INK2}" stroke-width="1" fill="none"/>')
            body.append(text(x0 + g * group_w + group_w / 2, bottom + 20, metric_label, 12, INK2, "middle"))
    body.append(text(24, height - 18, "Bars: macro average over queries. Whiskers: bootstrap 95% confidence interval (10,000 resamples of queries). "
                     "Synthetic data; k = 5.", 11, MUTED))
    return svg(width, height, "Semantic matching versus keyword and hybrid ranking",
               "Same 133 eligible mentors, same 22 labelled queries, same consent and availability rules", "".join(body))


# ---------- Figure 2: per-query F1 on transition queries (dot plot) ----------
def figure_transition(report):
    rows = [q for q in report["queries"] if q["set"] == "transition"]
    width, row_h, top = 980, 34, 112
    height = top + row_h * len(rows) + 70
    x0, x1 = 490, 950
    x_of = lambda v: x0 + v * (x1 - x0)
    body = [legend(24, 88, [(SERIES[i], label) for i, (_, label) in enumerate(SYSTEMS)])]
    for t in (0, 0.25, 0.5, 0.75, 1.0):
        x = x_of(t)
        body.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{top - 8}" y2="{top + row_h * len(rows)}" stroke="{GRID if t else AXIS}" stroke-width="1"/>')
        body.append(text(x, top + row_h * len(rows) + 18, f"{t:.2f}", 11, MUTED, "middle"))
    body.append(text((x0 + x1) / 2, top + row_h * len(rows) + 38, "F1@5 for the query", 12, INK2, "middle"))
    for i, q in enumerate(rows):
        y = top + i * row_h + row_h / 2
        label = q["query"] if len(q["query"]) <= 76 else q["query"][:74] + "…"
        body.append(text(x0 - 14, y + 4, label, 12, INK2, "end"))
        for s, (system, _) in enumerate(SYSTEMS):
            body.append(f'<circle cx="{x_of(q[system]["f1_at_5"]):.1f}" cy="{y + (s - 1) * 7:.1f}" r="5" fill="{SERIES[s]}" stroke="{SURFACE}" stroke-width="2"/>')
    return svg(width, height, "Where the systems differ: career-transition queries",
               "Relevance depends on where a mentor works now, which the query rarely names. Dots offset vertically by system.", "".join(body))


# ---------- Figure 3: threshold sensitivity (small multiples) ----------
def figure_threshold(report):
    rows = report["threshold_sweep"]
    production = report.get("similarity_threshold", 0.5)
    panels = [("precision_at_5", "Precision@5 (22 queries)", 1.0, [0, 0.25, 0.5, 0.75, 1.0], lambda t: f"{t:.2f}"),
              ("mean_results_returned", "Mean results returned (of 5)", 5.0, [0, 1, 2, 3, 4, 5], lambda t: f"{t:.0f}"),
              ("negative_control_results", "Results for an off-topic query", 5.0, [0, 1, 2, 3, 4, 5], lambda t: f"{t:.0f}")]
    width, height, top, bottom = 980, 400, 104, 330
    panel_w, gap = 250, 65
    xs = [r["threshold"] for r in rows]
    body = []
    for p, (key, label, ymax, ticks, fmt) in enumerate(panels):
        x0 = 70 + p * (panel_w + gap)
        x_of = lambda v: x0 + (v - xs[0]) / (xs[-1] - xs[0]) * panel_w
        y_of = lambda v: bottom - v / ymax * (bottom - top)
        body.append(text(x0, top - 16, label, 13, INK, weight=600))
        body.append(y_axis(x0, x0 + panel_w, y_of, ticks, fmt))
        for t in xs:
            body.append(text(x_of(t), bottom + 18, f"{t:.2f}", 11, MUTED, "middle"))
        px = x_of(production)
        body.append(f'<line x1="{px:.1f}" x2="{px:.1f}" y1="{top}" y2="{bottom}" stroke="{INK2}" stroke-width="1"/>')
        points = " ".join(f"{x_of(r['threshold']):.1f},{y_of(r[key]):.1f}" for r in rows)
        body.append(f'<polyline points="{points}" fill="none" stroke="{SERIES[0]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
        for r in rows:
            body.append(f'<circle cx="{x_of(r["threshold"]):.1f}" cy="{y_of(r[key]):.1f}" r="4" fill="{SERIES[0]}" stroke="{SURFACE}" stroke-width="2"/>')
        body.append(text(x0 + panel_w / 2, bottom + 38, "similarity threshold", 12, INK2, "middle"))
    return svg(width, height, "Choosing the similarity threshold",
               f"Semantic ranking only. Vertical line: the production threshold ({production:.2f}), which this analysis did not change.", "".join(body))


# ---------- Figure 4: latency against concurrent matching load ----------
def figure_latency(perf):
    rows = perf["summary"]
    def series(kind, stat):
        points = []
        for r in rows:
            if r["kind"] == kind and r.get(f"{stat}_ms") is not None:
                points.append((r["concurrent_searchers"], r[f"{stat}_ms"]))
        return sorted(points)
    panels = [("matching (via app)", "Mentor search through the web app"), ("page", "Five ordinary pages")]
    width, height, top, bottom = 980, 472, 140, 360
    panel_w, gap = 350, 130
    body = [legend(24, 88, [(SERIES[0], "median"), (SERIES[1], "95th percentile")])]
    levels = sorted({r["concurrent_searchers"] for r in rows})
    for p, (kind, label) in enumerate(panels):
        x0 = 80 + p * (panel_w + gap)
        med, p95 = series(kind, "median"), series(kind, "p95")
        if not med:
            continue
        ymax = max(v for _, v in p95 + med)
        step = next(s for s in (5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000) if ymax / s <= 5)
        top_tick = step * (int(ymax / step) + 1)
        ticks = [step * i for i in range(int(top_tick / step) + 1)]
        x_of = lambda v: x0 + levels.index(v) / (len(levels) - 1) * panel_w
        y_of = lambda v: bottom - v / top_tick * (bottom - top)
        body.append(text(x0, top - 18, label if len(label) < 60 else label[:58] + "…", 13, INK, weight=600))
        body.append(y_axis(x0, x0 + panel_w, y_of, ticks, lambda t: f"{t:,.0f} ms"))
        for lv in levels:
            body.append(text(x_of(lv), bottom + 18, "idle" if lv == 0 else str(lv), 11, MUTED, "middle"))
        body.append(text(x0 + panel_w / 2, bottom + 38, "concurrent mentor searches running", 12, INK2, "middle"))
        for s, points in enumerate((med, p95)):
            body.append(f'<polyline points="{" ".join(f"{x_of(a):.1f},{y_of(b):.1f}" for a, b in points)}" fill="none" '
                        f'stroke="{SERIES[s]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
            for a, b in points:
                body.append(f'<circle cx="{x_of(a):.1f}" cy="{y_of(b):.1f}" r="4" fill="{SERIES[s]}" stroke="{SURFACE}" stroke-width="2"/>')
            a, b = points[-1]
            body.append(text(x_of(a) + 10, y_of(b) + 4, f"{b:,.0f} ms", 11, INK2))
    env = perf["environment"]
    body.append(text(24, height - 36, "Ordinary pages: Network, Events, Opportunities, Profile and Notifications, each requested 20 times per load level.", 11, MUTED))
    body.append(text(24, height - 18, f"One shared machine: {env['cpus']} vCPU, {env['memory_gb']} GB RAM ({'GitHub Codespaces' if env.get('codespaces') else env['platform']}); "
                     "web app, matching service, PostgreSQL and load generator together.", 11, MUTED))
    return svg(width, height, "Response time as mentor-search load increases",
               "Successful requests only; errors are reported separately in the latency table", "".join(body))


# ---------- Figure 5: event propagation ----------
def figure_events(rows):
    items = [(r["scenario"], float(r["end_to_end_s"])) for r in rows if r.get("end_to_end_s") not in (None, "")]
    if not items:
        return None
    labels = {"S1 profile created": "New profile (first event loads the model)", "S2 profile updated": "Profile updated",
              "S4 malformed event": "Update after a malformed event", "S5 Kafka down at runtime": "Saved while Kafka was down (a)",
              "S6 worker down": "Saved while the worker was stopped (b)", "S7 worker starts while Kafka is down": "Worker started before Kafka (c)",
              "S8 consent renewed": "Consent given again"}
    width, row_h, top = 980, 36, 100
    height = top + row_h * len(items) + 112
    x0, x1 = 330, 900
    vmax = max(v for _, v in items)
    step = next(s for s in (1, 2, 5, 10, 20, 30, 60, 120) if vmax / s <= 6)
    top_tick = step * (int(vmax / step) + 1)
    x_of = lambda v: x0 + v / top_tick * (x1 - x0)
    body = []
    for t in range(0, int(top_tick) + 1, step):
        x = x_of(t)
        body.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{top - 6}" y2="{top + row_h * len(items)}" stroke="{GRID if t else AXIS}" stroke-width="1"/>')
        body.append(text(x, top + row_h * len(items) + 18, f"{t} s", 11, MUTED, "middle"))
    for i, (scenario, value) in enumerate(items):
        y = top + i * row_h + (row_h - 20) / 2
        body.append(text(x0 - 14, y + 14, labels.get(scenario, scenario), 12, INK2, "end"))
        body.append(bar(x0, y, max(x_of(value) - x0, 2), 20, SERIES[0]))
        body.append(text(x_of(value) + 8, y + 14, f"{value:.1f} s", 11.5, INK2))
    notes = ["Time from the change being saved until the mentor ranks first for its new topic in live search; one measured run each.",
             "(a) timed from the broker being reachable again.  (b) timed from the worker restarting; includes loading the model.",
             "(c) change saved after the broker returned; includes the worker's reconnect back-off and model load."]
    for n, note in enumerate(notes):
        body.append(text(24, height - 54 + n * 18, note, 11, MUTED))
    return svg(width, height, "How quickly profile changes reach mentor search", "Event-driven re-indexing, end to end", "".join(body))


# ---------- Figures 4.6-4.8: 200- vs 500-profile corpus ----------
CORPUS = [("200", "#86b6ef"), ("500", "#1c5cab")]  # validated ordinal blue ramp: larger corpus is darker


def read_csv(path):
    with path.open(encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def grouped_panels(title, subtitle, panels, groups, series, value, fmt, ymax, ticks, note, legend_items):
    """Small multiples of grouped columns. panels: [(key, label)]; groups: [(key, label)]; series: [(key, colour)]."""
    width, height, top, bottom = 980, 460, 140, 370
    gap = 50
    panel_w = (width - 80 - gap * (len(panels) - 1) - 24) / len(panels)
    body = [legend(24, 88, legend_items)]
    for p_index, (panel, panel_label) in enumerate(panels):
        x0 = 70 + p_index * (panel_w + gap)
        y_of = lambda v: bottom - v / ymax * (bottom - top)
        body.append(text(x0, top - 18, panel_label, 13, INK, weight=600))
        body.append(y_axis(x0, x0 + panel_w, y_of, ticks, fmt))
        group_w = panel_w / len(groups)
        bar_w = min(22, (group_w - 16) / len(series) - 2)
        for g_index, (group, group_label) in enumerate(groups):
            start = x0 + g_index * group_w + (group_w - len(series) * (bar_w + 2) + 2) / 2
            for s_index, (key, colour) in enumerate(series):
                v = value(panel, group, key)
                if v is not None:
                    body.append(column(start + s_index * (bar_w + 2), y_of(v), bar_w, bottom, colour))
            body.append(text(x0 + g_index * group_w + group_w / 2, bottom + 18, group_label, 11.5, INK2, "middle"))
    for n, line in enumerate(note):
        body.append(text(24, height - 36 + n * 18, line, 11, MUTED))
    return svg(width, height, title, subtitle, "".join(body))


def figure_corpus_quality(subsets):
    rows = {(r["subset"], r["corpus"], r["system"]): r for r in subsets if r["subset"] == "original_22"}
    systems = [(label, label.split(" (")[0]) for _, label in SYSTEMS_LONG]
    metrics = [("precision_at_5", "Precision@5"), ("normalised_recall_at_5", "Normalised Recall@5"), ("reciprocal_rank", "MRR@5")]
    mentors = {r["corpus"]: r["eligible_mentors"] for r in subsets}
    return grouped_panels(
        "Effect of corpus size on the same 22 queries", "200-profile corpus vs 500-profile corpus; labels recomputed per corpus by the same rules",
        metrics, systems, CORPUS, lambda m, g, c: float(rows[("original_22", c, g)][m]), lambda t: f"{t:.2f}", 1.0, [0, 0.25, 0.5, 0.75, 1.0],
        ["Normalised Recall@5 = relevant results in the top 5 / min(5, relevant mentors); plain Recall@5 falls as relevant sets grow.",
         "Values and 95% confidence intervals: evaluation/results/expanded/comparison/subsets.csv."],
        [(c, f"{n} profiles ({mentors[n]} eligible mentors)") for n, c in CORPUS])


def figure_query_types(by_set):
    sets = [r["set"] for r in by_set if r["corpus"] == "500" and r["system"].startswith("Semantic")]
    rows = {(r["set"], r["system"]): r for r in by_set if r["corpus"] == "500"}
    counts = {r["set"]: r["queries"] for r in by_set if r["corpus"] == "500"}
    groups = [(s, f"{s} ({counts[s]})") for s in sets]
    series = [(label, SERIES[i]) for i, (_, label) in enumerate(SYSTEMS_LONG)]
    return grouped_panels(
        "Which query types each method handles best (500-profile corpus)", "F1@5 by query type; number of queries in brackets",
        [("f1_at_5", "F1@5")], groups, series, lambda m, g, c: float(rows[(g, c)][m]), lambda t: f"{t:.2f}", 1.0, [0, 0.25, 0.5, 0.75, 1.0],
        ["Skill, leadership, industry and broad queries name the exact skill, title or topic the label rule checks, which favours keyword",
         "matching; career-transition queries describe a destination in other words, where semantic matching leads. Domain queries tie."],
        [(SERIES[i], label) for i, (_, label) in enumerate(SYSTEMS_LONG)])


def figure_corpus_latency(latency):
    rows = {(r["corpus"], r["system"]): r for r in latency}
    groups = [("semantic_repeated|median_ms", "Semantic median"), ("semantic_repeated|p95_ms", "Semantic p95"),
              ("hybrid|median_ms", "Hybrid median"), ("hybrid|p95_ms", "Hybrid p95")]
    value = lambda m, g, c: float(rows[(c, g.split("|")[0])][g.split("|")[1]])
    top = max(value(None, g, c) for g, _ in groups for c, _ in CORPUS)
    step = 25 if top <= 150 else 50
    ymax = step * (int(top / step) + 1)
    mentors = {r["corpus"]: r["eligible_mentors"] for r in latency}
    return grouped_panels(
        "Search latency barely changes with corpus size", "Same 45 queries, same machine, sequential calls (semantic: 5 rounds, 225 calls per corpus)",
        [("latency", "Milliseconds")], groups, CORPUS, value, lambda t: f"{t:.0f} ms", ymax, list(range(0, int(ymax) + 1, step)),
        ["Hybrid was timed once per answerable query (33 at 200, 45 at 500). Keyword (TF-IDF, in-process) took about 2 ms in both.",
         "2.4x more eligible mentors added about 2-3 ms, consistent with fixed per-query costs such as query encoding dominating."],
        [(c, f"{n} profiles ({mentors[n]} eligible mentors)") for n, c in CORPUS])


def main():
    FIGURES.mkdir(parents=True, exist_ok=True)
    made = []

    def save(name, content):
        if content:
            (FIGURES / name).write_text(content, encoding="utf-8")
            made.append(name)

    matching = RESULTS / "matching_evaluation.json"
    if matching.exists():
        report = json.loads(matching.read_text(encoding="utf-8"))
        save("fig4_1_matching_comparison.svg", figure_comparison(report))
        save("fig4_2_transition_queries.svg", figure_transition(report))
        if "threshold_sweep" in report:
            save("fig4_3_threshold_sensitivity.svg", figure_threshold(report))
    else:
        print("skip matching figures: run scripts/evaluate_matching.py")
    perf = RESULTS / "performance/summary.json"
    if perf.exists():
        save("fig4_4_latency_under_load.svg", figure_latency(json.loads(perf.read_text(encoding="utf-8"))))
    else:
        print("skip latency figure: run scripts/evaluate_performance.mjs")
    events = RESULTS / "event_pipeline/scenarios.csv"
    if events.exists():
        with events.open(encoding="utf-8") as handle:
            save("fig4_5_event_propagation.svg", figure_events(list(csv.DictReader(handle))))
    else:
        print("skip event figure: run scripts/evaluate_event_pipeline.py")
    comparison = RESULTS / "expanded/comparison"
    if (comparison / "subsets.csv").exists():
        save("fig4_6_corpus_size_quality.svg", figure_corpus_quality(read_csv(comparison / "subsets.csv")))
        save("fig4_7_query_types_500.svg", figure_query_types(read_csv(comparison / "by_set.csv")))
        save("fig4_8_corpus_size_latency.svg", figure_corpus_latency(read_csv(comparison / "latency.csv")))
    else:
        print("skip corpus-size figures: run scripts/compare_dataset_sizes.py")
    print("\n".join(f"wrote evaluation/figures/{name}" for name in made))


if __name__ == "__main__":
    main()
