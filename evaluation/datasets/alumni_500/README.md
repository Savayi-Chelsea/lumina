# 500-profile synthetic evaluation dataset

Fictional former Kenya Airways staff for evaluating mentor matching at a larger scale.
Used only by the evaluation; the demo application and its tests keep the 200-profile
dataset in `data/`.

| File | Contents |
| --- | --- |
| `synthetic_alumni_500.csv` | 500 profiles. Rows ALUM-001–200 are `data/synthetic_alumni.csv` unchanged (checked by `tests/synthetic/test_evaluation_dataset.py`); ALUM-201–500 are new |
| `synthetic_work_history_500.csv` | 1,479 work-history entries, same format as `data/synthetic_work_history.csv` |
| `profile_metadata_500.csv` | For new profiles: experience level, career path and kind of move (used for analysis, not by matching) |

Rebuild (deterministic; identical bytes every run):

```bash
.venv/bin/python scripts/generate_evaluation_dataset.py
```

## The 300 new profiles

- **12 departments, 25 new profiles each**, so each department ends with 37–47 profiles.
- **Experience levels:** 61 early-career, 136 mid-career, 70 senior, 33 executive. KQ start
  year and tenure follow the level, early-career alumni never held senior KQ roles (such as
  Captain or Purser), and long KQ careers include an earlier junior role.
- **Career paths:** 35 destinations in three kinds of move: 44 stayed in aviation, 160 moved
  to an adjacent field (for example logistics, hospitality, banking, HR, coaching), and 96
  changed career (for example software, renewable energy, NGOs, healthcare, government,
  agribusiness, real estate, their own business). Career changers enter the new field one
  seniority step lower; work history runs KQ role(s) → previous step on the new path (when
  there was time) → current role, always in year order.
- **Skills and topics:** two KQ-era skills, two or three skills of the current role, and
  leadership skills for senior people. Mentorship topics come from the department, the new
  path, and, for people who moved, topics such as "Career change after aviation".
- **Mentor consent and availability** follow the baseline rates: 82.3% consent and 79.0%
  available among new profiles (baseline 84.5% and 80.0%). Availability is a little lower for
  executives. Overall, 325 of 500 profiles are eligible mentors (65.0%; baseline 66.5%).
- Across all 500: 20 industries, 140 distinct skills, 143 distinct current job titles
  (baseline: 12, 84 and 70).

All names, organisations and career stories are invented. Two names repeat within the
original Sprint I rows (kept unchanged); every new name is unique.
