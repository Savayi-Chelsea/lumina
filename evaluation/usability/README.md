# Usability evaluation kit (prepared, not yet run)

**Status: no participant has taken part yet. This folder contains the protocol, tasks,
questionnaire and empty templates only. No usability results exist and none may be
reported until real sessions are run.**

| File | Purpose |
| --- | --- |
| `protocol.md` | How to recruit, brief, run and record a session; ethics and data handling |
| `tasks_checklist.md` | The 10 tasks, their success criteria and the observer checklist |
| `sus_questionnaire.md` | The System Usability Scale (Brooke, 1996), ready to print or copy into a form |
| `task_results_template.csv` | One row per participant per task (fill in during sessions) |
| `sus_responses_template.csv` | One row per participant, ten SUS answers (1–5) |
| `../../scripts/score_sus.py` | Scores SUS and summarises task results from the filled CSVs |

After the sessions:

```bash
cp evaluation/usability/task_results_template.csv evaluation/usability/task_results.csv   # then fill in
cp evaluation/usability/sus_responses_template.csv evaluation/usability/sus_responses.csv # then fill in
.venv/bin/python scripts/score_sus.py
```

The scorer refuses to produce numbers from an empty or partially filled file, so a
template can never be mistaken for data.
