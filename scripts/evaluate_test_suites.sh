#!/usr/bin/env bash
# Runs every automated test suite and records machine-readable results for the evaluation.
#
#   bash scripts/evaluate_test_suites.sh
#
# Needs: containers up (bash scripts/containers.sh), a current production build
# (npm run build), the matching service on :8000, and Playwright Chromium. The
# end-to-end suites start their own web servers and remove their own fixtures.
# Writes evaluation/results/tests/: one log per suite, vitest.json, pytest.xml and
# summary.md / summary.json (pass, fail and skip counts per suite).
set -uo pipefail
cd "$(dirname "$0")/.."
OUT=evaluation/results/tests
mkdir -p "$OUT"
rm -f "$OUT"/*.log "$OUT"/status.tsv
# Each suite loads .env itself without overriding the environment (so Codespaces secrets win).
export POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}" LUMINA_TEST_DATABASE=1 LUMINA_TEST_KAFKA=1 LUMINA_TEST_SYNTHETIC_DIRECTORY=1 LUMINA_TEST_GOOGLE_REDIRECT=1

suite() { # suite NAME COMMAND...
  local name="$1"; shift
  printf '%-28s ' "$name"
  local start=$SECONDS
  "$@" >"$OUT/$name.log" 2>&1
  local code=$?
  printf '%s (%ss)\n' "$([ $code = 0 ] && echo pass || echo "FAIL, exit $code")" "$((SECONDS - start))"
  printf '%s\t%s\t%s\n' "$name" "$code" "$((SECONDS - start))" >> "$OUT/status.tsv"
}

suite lint npm run lint
suite typecheck npm run typecheck
suite vitest npx vitest run --reporter=default --reporter=json --outputFile.json="$OUT/vitest.json"
suite pytest .venv/bin/python -m pytest services/matching/tests tests/registry tests/synthetic -p no:warnings -q --junitxml="$OUT/pytest.xml"
suite http-smoke npm run test:auth:http
suite browser-smoke npm run test:frontend:browser
suite mentorship-live npm run test:mentorship:live

.venv/bin/python - "$OUT" <<'EOF'
import json, re, sys, xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
out = Path(sys.argv[1])
status = {line.split("\t")[0]: (int(line.split("\t")[1]), int(line.split("\t")[2])) for line in (out / "status.tsv").read_text().splitlines()}
rows = []
def add(suite, area, passed, failed, skipped, unit):
    code, seconds = status[suite]
    rows.append({"suite": suite, "area": area, "passed": passed, "failed": failed, "skipped": skipped, "unit": unit,
                 "exit_code": code, "seconds": seconds, "result": "pass" if code == 0 and not failed else "FAIL"})
add("lint", "Static analysis (ESLint)", int(status["lint"][0] == 0), int(status["lint"][0] != 0), 0, "run")
add("typecheck", "Type safety (tsc --noEmit)", int(status["typecheck"][0] == 0), int(status["typecheck"][0] != 0), 0, "run")
if (out / "vitest.json").exists():
    v = json.loads((out / "vitest.json").read_text())
    add("vitest", "Web app: auth, verification, mentorship, social, privacy, jobs (incl. live PostgreSQL)",
        v["numPassedTests"], v["numFailedTests"], v["numPendingTests"] + v.get("numTodoTests", 0), "tests")
pytest_log = (out / "pytest.log").read_text(errors="replace")
final = [line for line in pytest_log.splitlines() if re.search(r"\d+ (passed|failed)", line)][-1]
count = lambda word: sum(int(n) for n in re.findall(rf"(\d+) {word}", final))
subtests = sum(int(n) for n in re.findall(r"(\d+) subtests passed", final))
add("pytest", f"Matching service, indexing, Kafka worker (live broker), registry, seeding, email worker (+{subtests} subtests passed)",
    count("passed"), count("failed") + count("error"), count("skipped"), "tests")
for suite, area in (("http-smoke", "Production HTTP: sessions, roles, verification, sign-out"),
                    ("browser-smoke", "Browser end-to-end: every member and admin journey, 5 viewports"),
                    ("mentorship-live", "Live demo path: Google-linked session to real BGE mentor results")):
    log = (out / f"{suite}.log").read_text(errors="replace")
    add(suite, area, len(re.findall(r"^PASS ", log, re.M)), len(re.findall(r"^(?:FAIL|not ok)\b", log, re.M)) + (status[suite][0] != 0 and not re.search(r"^FAIL", log, re.M)), 0, "scenarios")
summary = {"run_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "suites": rows,
           "all_passed": all(r["result"] == "pass" for r in rows)}
(out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
lines = ["# Automated test results", "", f"Run {summary['run_at']} with live PostgreSQL, Kafka and the matching service "
         "(LUMINA_TEST_DATABASE=1, LUMINA_TEST_KAFKA=1, LUMINA_TEST_SYNTHETIC_DIRECTORY=1, LUMINA_TEST_GOOGLE_REDIRECT=1). Command: `bash scripts/evaluate_test_suites.sh`.", "",
         "| Suite | What it covers | Passed | Failed | Skipped | Result | Time |", "| --- | --- | --- | --- | --- | --- | --- |"]
lines += [f"| {r['suite']} | {r['area']} | {r['passed']} {r['unit']} | {r['failed']} | {r['skipped']} | {r['result']} | {r['seconds']} s |" for r in rows]
lines += ["", "Full output for each suite is in the matching `.log` file in this folder; `vitest.json` and `pytest.xml` hold per-test results.", ""]
(out / "summary.md").write_text("\n".join(lines))
print("\n".join(lines))
EOF
