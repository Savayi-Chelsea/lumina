"""Seed fictional, clearly labelled sample events and opportunities (local only).

Rows use fixed UUIDs and synthetic = TRUE, so reruns update them in place
(refreshing dates relative to today) and never touch admin-created listings.

Each sample event also gets attendees drawn from the synthetic alumni (people
from the matching department or city first), and each open sample opportunity
a few applicants, so past and upcoming listings never look empty. Reruns
replace only synthetic alumni's registrations and applications on sample
listings; real members' registrations and applications are never touched, and
upcoming events always keep free places.
"""
import argparse
import random
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone

import psycopg
from local_database import local_dsn

EAT = timezone(timedelta(hours=3))
NAMESPACE = uuid.UUID("6f1d3a52-5c38-4b1e-9b7a-1f3c0d0e4a11")

# (key, title, category, format, location, days from today, start hour, hours, capacity, summary, description)
EVENTS = [
    ("homecoming", "Lumina Homecoming Sundowner", "Reunion", "in_person", "Nairobi · Westlands", 9, 17, 3, 120,
     "An evening to reconnect with former colleagues from every department.",
     "Join former cabin crew, engineers, ground teams and head-office colleagues for an informal sundowner. Light refreshments, a short welcome and plenty of time to catch up. Bring a friend from your old team."),
    ("cloud-careers", "From the Hangar to the Cloud", "Career conversation", "online", "Online · Video call", 4, 19, 1, 300,
     "Alumni who moved into technology share how they made the switch.",
     "Three alumni who moved from aviation operations and engineering into cloud and software roles talk about the skills that transferred, the certifications that helped and what they would do differently. Live questions welcome."),
    ("leadership-circle", "Leadership Under Pressure Circle", "Mentorship circle", "hybrid", "Nairobi · Kilimani and online", 14, 18, 2, 20,
     "A small-group mentorship circle on decision-making when stakes are high.",
     "Former captains and operations managers host a candid discussion on leading teams through disruption. Places are limited to keep the conversation personal."),
    ("cv-workshop", "Translating Aviation Experience for New Industries", "Workshop", "online", "Online · Workshop", 21, 10, 2, 60,
     "A practical workshop on CVs, LinkedIn profiles and interviews outside aviation.",
     "Bring your CV. We will work through describing safety culture, customer recovery and operational discipline in language employers in other sectors recognise."),
    ("mombasa-mixer", "Coast Alumni Networking Mixer", "Networking", "in_person", "Mombasa · Nyali", 28, 18, 3, 50,
     "Meet alumni based at the coast in tourism, logistics and hospitality.",
     "An informal mixer for alumni living and working around Mombasa. Short introductions, then open networking."),
    ("tree-planting", "Community Tree Planting Morning", "Community service", "in_person", "Nairobi · Karura Forest", 35, 8, 3, 40,
     "Give a morning back to the city with fellow alumni and their families.",
     "Join a guided tree-planting session. Families are welcome. Tools and refreshments are provided."),
    ("finance-talk", "Life After Airline Finance", "Career conversation", "online", "Online · Video call", -12, 19, 1, None,
     "Former finance and revenue colleagues on careers in banking and consulting.",
     "A recorded conversation with alumni who moved from airline finance into banking, audit and consulting."),
    ("cargo-reunion", "Cargo and Ground Operations Reunion", "Reunion", "in_person", "Nairobi · Embakasi", -30, 16, 4, 80,
     "A reunion for cargo, ramp and ground operations colleagues.",
     "An afternoon of stories and catching up for everyone who kept the ramp and the warehouse moving."),
]

# (key, title, organization, type, work mode, location, industry, closes in days or None, summary, description, how to apply)
OPPORTUNITIES = [
    ("ops-advisor", "Aviation Operations Advisor", "Horizon Aviation Advisory", "Advisory", "hybrid", "Nairobi", "Aviation consulting", 30,
     "Part-time advisory role reviewing turnaround and on-time performance for regional carriers.",
     "Advise a small consultancy on ground handling, turnaround planning and on-time performance improvement for regional airlines. Around four days a month.",
     "Apply through Lumina with a short note on your turnaround or ground operations experience. The advisory lead contacts shortlisted alumni within two weeks."),
    ("cloud-engineer", "Junior Cloud Support Engineer", "Kijani Cloud Services", "Job", "remote", "Remote · Kenya", "Information technology", 21,
     "Entry-level cloud support role suited to alumni moving into technology.",
     "Support customers running workloads on AWS. Training is provided; experience with Linux, networking or IT support is helpful.",
     "Apply through Lumina and use the note to explain your move into cloud technology. Shortlisted applicants are asked for a CV."),
    ("cx-trainer", "Customer Experience Trainer", "Safari Hospitality Group", "Contract", "on_site", "Mombasa", "Hospitality", 45,
     "Six-month contract training hotel teams in service recovery.",
     "Design and deliver customer-service and service-recovery training for front-of-house teams across three coastal hotels.",
     "Apply through Lumina and outline, in your note, a training session you have delivered."),
    ("safety-volunteer", "Aviation Safety Mentor for Students", "Skyward Youth Programme", "Volunteer", "hybrid", "Nairobi", "Education", None,
     "Mentor aviation students preparing for careers in safety and quality.",
     "Meet a small group of students once a month to share real-world safety and quality experience.",
     "Apply through Lumina to express interest; the programme coordinator follows up with a short introductory call."),
    ("finance-analyst", "Revenue Analyst", "Meridian Logistics", "Job", "on_site", "Nairobi", "Logistics", 14,
     "Revenue and pricing analysis role for a regional logistics company.",
     "Analyse route and customer profitability and support pricing decisions. Airline revenue management experience is valued.",
     "Apply through Lumina and summarise, in your note, a pricing or revenue analysis you led."),
    ("hr-intern", "People and Culture Internship", "Tamu Foods", "Internship", "on_site", "Nairobi", "Food and beverage", 10,
     "Three-month internship for early-career alumni interested in HR.",
     "Support recruitment, onboarding and employee engagement projects.",
     "Apply through Lumina with a short paragraph on why people operations interests you."),
    ("closed-role", "Ground Handling Supervisor", "Jambo Ground Services", "Job", "on_site", "Kisumu", "Aviation services", -5,
     "Supervisory role for ramp operations (closed listing for demonstration).",
     "Supervise ramp teams and coordinate aircraft turnarounds.",
     "Applications have closed."),
]


# Synthetic attendees per sample event: (share of capacity, or a head count when
# uncapped; preferred former departments; preferred cities).
ATTENDANCE = {
    "homecoming": (0.62, [], ["Nairobi"]),
    "cloud-careers": (0.31, ["ICT / Digital", "Engineering & Maintenance", "Flight Operations"], []),
    "leadership-circle": (0.8, ["Flight Operations", "Safety & Quality", "Ground Operations"], []),
    "cv-workshop": (0.58, ["Cabin Services", "Customer Experience", "Ground Operations"], []),
    "mombasa-mixer": (0.56, [], ["Mombasa"]),
    "tree-planting": (0.55, [], ["Nairobi"]),
    "finance-talk": (46, ["Finance", "Commercial"], []),
    "cargo-reunion": (0.7, ["Cargo", "Ground Operations"], ["Nairobi"]),
}
# Synthetic applicants per open sample opportunity: (count, preferred departments).
APPLICANTS = {
    "ops-advisor": (6, ["Ground Operations", "Flight Operations"]),
    "cloud-engineer": (9, ["ICT / Digital", "Engineering & Maintenance"]),
    "cx-trainer": (5, ["Customer Experience", "Cabin Services"]),
    "safety-volunteer": (4, ["Safety & Quality"]),
    "finance-analyst": (7, ["Finance", "Commercial"]),
    "hr-intern": (3, ["Human Resources", "Corporate Services"]),
}
SEED = 20261121
FREE_PLACES = 2  # upcoming events always keep at least this many places for real members
NOTES = [
    "I would welcome the chance to bring my experience to this role.",
    "This matches the work I have been doing since leaving KQ. Happy to share more detail.",
    "I have led similar work before and would be glad to talk it through.",
    "",
    "Interested. My profile has the details of my recent roles.",
]


def ranked_people(rng, people, departments, cities):
    """Shuffle, then put people from the preferred departments or cities first."""
    order = people[:]
    rng.shuffle(order)
    return sorted(order, key=lambda p: (p[1] not in departments if departments else False) + (p[2] not in cities if cities else False))


def seed_attendance(conn, today):
    people = conn.execute("""SELECT u.id::text, p.former_kq_department, p.location FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE u.email LIKE '%%@synthetic.lumina.local' AND u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified
        ORDER BY u.email""").fetchall()
    if not people:
        return 0, 0
    ids = [p[0] for p in people]
    now = datetime.now(timezone.utc)
    registrations = applications = 0
    for key, (share, departments, cities) in ATTENDANCE.items():
        event_id = str(uuid.uuid5(NAMESPACE, f"event:{key}"))
        row = conn.execute("SELECT starts_at, capacity FROM events WHERE id = %s AND synthetic", (event_id,)).fetchone()
        if not row:
            continue
        starts_at, capacity = row
        conn.execute("DELETE FROM event_registrations WHERE event_id = %s AND user_id = ANY(%s::uuid[])", (event_id, ids))
        real = conn.execute("SELECT count(*) FROM event_registrations WHERE event_id = %s", (event_id,)).fetchone()[0]
        target = round(capacity * share) if capacity else int(share)
        if capacity:
            target = min(target, capacity - real - (FREE_PLACES if starts_at > now else 0))
        rng = random.Random(f"{SEED}:{key}")
        for uid, _, _ in ranked_people(rng, people, departments, cities)[:max(0, target)]:
            latest = min(starts_at - timedelta(hours=2), now - timedelta(minutes=30))
            registered = latest - timedelta(days=rng.uniform(0, 21), minutes=rng.randint(0, 1439))
            conn.execute("INSERT INTO event_registrations (event_id, user_id, registered_at) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                         (event_id, uid, registered))
            registrations += 1
    for key, (count, departments) in APPLICANTS.items():
        opportunity_id = str(uuid.uuid5(NAMESPACE, f"opportunity:{key}"))
        if not conn.execute("SELECT 1 FROM opportunities WHERE id = %s AND synthetic", (opportunity_id,)).fetchone():
            continue
        conn.execute("DELETE FROM opportunity_applications WHERE opportunity_id = %s AND user_id = ANY(%s::uuid[])", (opportunity_id, ids))
        rng = random.Random(f"{SEED}:apply:{key}")
        for uid, _, _ in ranked_people(rng, people, departments, [])[:count]:
            applied = now - timedelta(days=rng.uniform(0.2, 12))
            conn.execute("""INSERT INTO opportunity_applications (opportunity_id, user_id, note, created_at)
                VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING""", (opportunity_id, uid, rng.choice(NOTES) or None, applied))
            applications += 1
    return registrations, applications


def event_rows(today):
    for key, title, category, fmt, location, days, hour, hours, capacity, summary, description in EVENTS:
        start = datetime.combine(today + timedelta(days=days), time(hour), EAT)
        yield (str(uuid.uuid5(NAMESPACE, f"event:{key}")), title, summary, description, category, fmt, location,
               start, start + timedelta(hours=hours), capacity)


def opportunity_rows(today):
    for key, title, organization, kind, mode, location, industry, closes, summary, description, apply_text in OPPORTUNITIES:
        yield (str(uuid.uuid5(NAMESPACE, f"opportunity:{key}")), title, organization, kind, mode, location, industry,
               summary, description, apply_text, None if closes is None else today + timedelta(days=closes))


def seed(apply=False):
    today = datetime.now(EAT).date()
    with psycopg.connect(local_dsn()) as conn:
        conn.execute("SET LOCAL lock_timeout = '5s'")
        if apply:
            for row in event_rows(today):
                conn.execute("""INSERT INTO events (id, title, summary, description, category, format, location, starts_at, ends_at, capacity, status, synthetic)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'published',TRUE)
                    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, summary=EXCLUDED.summary, description=EXCLUDED.description,
                      category=EXCLUDED.category, format=EXCLUDED.format, location=EXCLUDED.location, starts_at=EXCLUDED.starts_at,
                      ends_at=EXCLUDED.ends_at, capacity=EXCLUDED.capacity, updated_at=CURRENT_TIMESTAMP
                    WHERE events.synthetic""", row)
            for row in opportunity_rows(today):
                conn.execute("""INSERT INTO opportunities (id, title, organization, opportunity_type, work_mode, location, industry, summary, description, how_to_apply, closes_on, status, synthetic)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'published',TRUE)
                    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, organization=EXCLUDED.organization, opportunity_type=EXCLUDED.opportunity_type,
                      work_mode=EXCLUDED.work_mode, location=EXCLUDED.location, industry=EXCLUDED.industry, summary=EXCLUDED.summary,
                      description=EXCLUDED.description, how_to_apply=EXCLUDED.how_to_apply, closes_on=EXCLUDED.closes_on, updated_at=CURRENT_TIMESTAMP
                    WHERE opportunities.synthetic""", row)
            attendance = seed_attendance(conn, today)
        counts = conn.execute("SELECT (SELECT count(*) FROM events WHERE synthetic), (SELECT count(*) FROM opportunities WHERE synthetic)").fetchone()
    print(f"{'Seeded' if apply else 'Preview'}: {len(EVENTS)} sample events and {len(OPPORTUNITIES)} sample opportunities defined; "
          f"database now has {counts[0]} sample events and {counts[1]} sample opportunities")
    if apply:
        print(f"  {attendance[0]} synthetic event registrations and {attendance[1]} synthetic applications")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        seed(parser.parse_args().apply)
    except Exception as exc:
        print(f"Community seed failed ({type(exc).__name__}); rolled back", file=sys.stderr)
        sys.exit(1)
