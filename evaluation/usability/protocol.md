# Usability test protocol

## Aim

Find out whether former Kenya Airways employees can complete Lumina's core journeys
(sign-in and verification, profile, mentor discovery, networking, events, jobs and
privacy) without help, how long it takes, where they struggle, and how usable they
judge the system overall (System Usability Scale).

## Participants

- **Target:** 5–8 participants. Five usually reveals most serious problems
  (Nielsen & Landauer, 1993); eight gives a steadier SUS mean.
- **Who:** former KQ staff from at least three different backgrounds (for example
  cabin crew, engineering or maintenance, finance or HR, ground operations, ICT).
  If former KQ staff cannot be reached in time, use proxies with airline or
  customer-facing work experience, and state that in the report.
- **Exclude:** anyone who helped build Lumina.
- Record only a participant code (P01, P02…), background group and self-rated
  comfort with web apps (1–5). Never record names or contact details in these files.

## Ethics and consent

- Read the consent statement aloud and get verbal or written agreement before starting:
  participation is voluntary, they may stop at any time, it is the system being tested
  and not them, screen and voice are recorded only if they agree, and data is stored
  under a participant code and deleted after the project is assessed.
- Use the **demo environment with synthetic data**. Give each participant a prepared
  test account or a fictional registry card (see `tasks_checklist.md`). Participants
  never enter their own staff number or personal details.
- Follow the university's research-ethics requirements; this kit does not replace them.

## Setup (per session)

1. `bash scripts/start.sh` on the demo machine; confirm Admin › System health is green.
2. Prepare one fresh account per participant: either Google sign-in with a test
   Google account, or a password account created with `npm run demo:accounts`.
3. Open the app at the sign-in page in a private browser window; screen recording on
   (with consent). Have the task cards printed, one task per card.
4. Observer has `tasks_checklist.md` and the results template open.

## Running the session (about 35 minutes)

1. **Briefing (3 min).** Purpose, consent, "think aloud", "there are no wrong answers".
2. **Tasks (20–25 min).** Hand over one card at a time. Start the timer when the card is
   read; stop when the participant says they are done or gives up. Do not help unless
   they are stuck for 2 minutes or ask twice; record any help as an *assist*.
3. **After each task:** Single Ease Question: "Overall, how easy or difficult was this
   task?" 1 (very difficult) to 7 (very easy).
4. **SUS (3 min).** Participant fills in `sus_questionnaire.md` alone, immediately after
   the last task, before any discussion.
5. **Debrief (5 min).** What was most confusing? What would they use regularly? Was the
   "Why this match" explanation believable and useful? Would they trust the job feed?

## What to record (per task)

| Field | Values |
| --- | --- |
| `completed` | `yes`, `assisted` or `no` |
| `time_s` | seconds from reading the card to finishing or giving up |
| `errors` | count of wrong paths or wrong submissions the participant had to recover from |
| `seq` | Single Ease Question answer, 1–7 |
| `notes` | observed problems, quotes (no personal data) |

## Analysis

- Task success rate (completed without assistance) and mean time per task.
- Mean SEQ per task; tasks below 5 are usability problems to report.
- SUS: per-participant score 0–100, then mean, median and range
  (`scripts/score_sus.py`). Interpret against the commonly cited average of 68
  (Sauro, 2011), noting the small sample.
- List observed problems by severity (blocks the task / slows it / cosmetic).

## References

- Brooke, J. (1996). SUS: A "quick and dirty" usability scale. In *Usability Evaluation in Industry*, 189–194.
- Nielsen, J., & Landauer, T. K. (1993). A mathematical model of the finding of usability problems. *Proc. INTERCHI '93*, 206–213.
- Sauro, J. (2011). *A Practical Guide to the System Usability Scale*. Measuring Usability LLC.
- Sauro, J., & Dumas, J. S. (2009). Comparison of three one-question, post-task usability questionnaires. *Proc. CHI '09*, 1599–1608.
