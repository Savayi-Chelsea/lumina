"""Derive fictional verification fixtures; these are NOT real KQ employee records."""
import argparse
import csv
import re
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ["id", "synthetic_staff_number", "surname", "former_kq_department", "kq_start_year", "kq_end_year"]


def registry_rows(source):
    rows, seen = [], set()
    with Path(source).open(newline="", encoding="utf-8") as stream:
        for source_row in csv.DictReader(stream):
            synthetic_id = source_row["synthetic_id"]
            if not re.fullmatch(r"ALUM-[0-9]{3,}", synthetic_id) or synthetic_id in seen:
                raise ValueError("Invalid or duplicate synthetic source identifier")
            seen.add(synthetic_id)
            staff = "SYN-" + synthetic_id
            name = source_row["full_name"].split()
            if len(name) != 2:
                raise ValueError("This fixture generator expects the existing two-part synthetic names")
            start, end = int(source_row["kq_start_year"]), int(source_row["kq_end_year"])
            department = source_row["former_kq_department"].strip()
            if start < 1977 or end < start or not department or len(department) > 150:
                raise ValueError("Invalid synthetic service details")
            rows.append(dict(zip(FIELDS, [
                str(uuid5(NAMESPACE_URL, "lumina:synthetic-registry:" + staff)),
                staff, name[-1], department, start, end,
            ])))
    return rows


def generate(source=ROOT / "data/synthetic_alumni.csv", output=ROOT / "data/synthetic_alumni_registry.csv"):
    rows = registry_rows(source)
    with Path(output).open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "data/synthetic_alumni_registry.csv")
    args = parser.parse_args()
    print(f"Generated {len(generate(output=args.output))} FICTIONAL prototype registry fixtures. Not real KQ employees.")
