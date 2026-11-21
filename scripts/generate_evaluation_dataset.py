"""Build the 500-profile evaluation dataset (evaluation only; the demo stays at 200).

  .venv/bin/python scripts/generate_evaluation_dataset.py

Writes evaluation/datasets/alumni_500/:
  synthetic_alumni_500.csv        rows 1-200: the unchanged demo dataset (data/synthetic_alumni.csv),
                                  rows 201-500: new profiles from scripts/synthetic_expansion_500.py
  synthetic_work_history_500.csv  work history in the same format as data/synthetic_work_history.csv
  profile_metadata_500.csv        cohort, experience level and career path of each new profile
Deterministic: repeated runs produce identical files. data/ is only read, never written.
"""
import ast
import csv
from collections import Counter
from pathlib import Path

from synthetic_expansion_500 import evaluation_rows, evaluation_work_history

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "evaluation/datasets/alumni_500"
BASELINE, BASELINE_HISTORY = ROOT / "data/synthetic_alumni.csv", ROOT / "data/synthetic_work_history.csv"
NEW_IDS = tuple(f"ALUM-{n:03}" for n in range(201, 501))


def departments():
    """The department catalogue from generate_synthetic_data.py, read without running that script."""
    tree = ast.parse((ROOT / "scripts/generate_synthetic_data.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", None) == "departments":
            return ast.literal_eval(node.value)
    raise RuntimeError("departments not found in generate_synthetic_data.py")


def read(path):
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def build():
    baseline, baseline_history = read(BASELINE), read(BASELINE_HISTORY)
    if [r["synthetic_id"] for r in baseline] != [f"ALUM-{n:03}" for n in range(1, 201)]:
        raise SystemExit("data/synthetic_alumni.csv is not the expected 200-profile baseline")
    catalogue = departments()
    new_rows, meta = evaluation_rows(NEW_IDS, catalogue, {r["full_name"] for r in baseline})
    new_history = evaluation_work_history(new_rows, meta, catalogue)
    return baseline, baseline_history, new_rows, new_history, meta


def main():
    baseline, baseline_history, new_rows, new_history, meta = build()
    OUT.mkdir(parents=True, exist_ok=True)
    fields = list(baseline[0])
    write(OUT / "synthetic_alumni_500.csv", baseline + [{k: str(v) for k, v in r.items()} for r in new_rows], fields)
    write(OUT / "synthetic_work_history_500.csv", baseline_history + [{k: str(v) for k, v in r.items()} for r in new_history],
          list(baseline_history[0]))
    write(OUT / "profile_metadata_500.csv",
          [{"synthetic_id": r["synthetic_id"], "cohort": "baseline", "experience_level": "", "career_path": "", "move_type": "", "title_index": ""}
           for r in baseline] + meta, list(meta[0]))
    rows = baseline + new_rows
    consent = sum(str(r["consent_to_matching"]) == "True" for r in rows)
    available = sum(str(r["available_for_mentorship"]) == "True" for r in rows)
    eligible = sum(str(r["consent_to_matching"]) == "True" and str(r["available_for_mentorship"]) == "True" for r in rows)
    print(f"Wrote {len(rows)} profiles ({len(baseline)} baseline + {len(new_rows)} new) and "
          f"{len(baseline_history) + len(new_history)} work-history entries to {OUT.relative_to(ROOT)}")
    print(f"Consent {consent} ({consent / len(rows):.1%}), available {available} ({available / len(rows):.1%}), "
          f"eligible mentors {eligible} ({eligible / len(rows):.1%})")
    print("New profiles by level:", dict(Counter(m["experience_level"] for m in meta)))
    print("New profiles by move:", dict(Counter(m["move_type"] for m in meta)))
    print("All profiles by department:", dict(sorted(Counter(r["former_kq_department"] for r in rows).items())))


if __name__ == "__main__":
    main()
