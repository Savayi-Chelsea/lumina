"""Score the System Usability Scale and summarise task results from real usability sessions.

  .venv/bin/python scripts/score_sus.py

Reads evaluation/usability/sus_responses.csv and task_results.csv (copies of the
templates, filled in during sessions) and writes evaluation/usability/results.md.
Refuses to score empty files or incomplete answers: it never fills gaps or
produces example numbers, so a template cannot be mistaken for data.
"""
import csv
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "evaluation/usability"


def read(name):
    path = DIR / name
    if not path.exists():
        sys.exit(f"{path.relative_to(ROOT)} does not exist yet: copy the template and fill it in after real sessions.")
    with path.open(encoding="utf-8") as handle:
        rows = [row for row in csv.DictReader(handle) if any((value or "").strip() for value in row.values())]
    if not rows:
        sys.exit(f"{path.relative_to(ROOT)} has no responses yet. No usability results can be reported.")
    return rows


def sus_score(row):
    answers = []
    for i in range(1, 11):
        value = (row.get(f"q{i}") or "").strip()
        if value not in {"1", "2", "3", "4", "5"}:
            sys.exit(f"Participant {row.get('participant_id')}: q{i} must be 1-5 (got {value!r}). Fix the data; nothing was scored.")
        answers.append(int(value))
    return 2.5 * sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))


def main():
    sus = read("sus_responses.csv")
    tasks = read("task_results.csv")
    scores = {row["participant_id"]: sus_score(row) for row in sus}
    lines = ["# Usability results", "", f"Participants: {len(scores)}", "", "## System Usability Scale", "",
             "| Participant | Background | SUS |", "| --- | --- | --- |",
             *[f"| {row['participant_id']} | {row.get('background_group', '')} | {scores[row['participant_id']]:.1f} |" for row in sus], "",
             f"Mean {statistics.mean(scores.values()):.1f}, median {statistics.median(scores.values()):.1f}, "
             f"range {min(scores.values()):.1f}–{max(scores.values()):.1f}"
             + (f", standard deviation {statistics.stdev(scores.values()):.1f}" if len(scores) > 1 else "") + ".", "",
             "## Tasks", "", "| Task | Attempts | Completed unaided | Assisted | Failed | Mean time (s) | Mean SEQ (1–7) |",
             "| --- | --- | --- | --- | --- | --- | --- |"]
    for task in sorted({row["task_id"] for row in tasks}, key=lambda t: (t[0], int(t[1:]) if t[1:].isdigit() else 0)):
        rows = [row for row in tasks if row["task_id"] == task]
        outcome = lambda value: sum(1 for row in rows if row["completed"].strip().lower() == value)
        times = [float(row["time_s"]) for row in rows if row["time_s"].strip()]
        seqs = [float(row["seq"]) for row in rows if row["seq"].strip()]
        lines.append(f"| {task} | {len(rows)} | {outcome('yes')} | {outcome('assisted')} | {outcome('no')} | "
                     f"{statistics.mean(times):.0f} | {statistics.mean(seqs):.1f} |" if times and seqs else
                     f"| {task} | {len(rows)} | {outcome('yes')} | {outcome('assisted')} | {outcome('no')} | – | – |")
    (DIR / "results.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
