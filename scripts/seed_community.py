"""Seed fictional, clearly labelled sample events and opportunities (local only).

Rows use fixed UUIDs and synthetic = TRUE, so reruns update them in place
(refreshing dates relative to today) and never touch admin-created listings
or remove registrations. The interface labels every row "Sample listing".
"""
import argparse
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
     "Send a short note describing your operations experience to the advisory lead named in the community newsletter."),
    ("cloud-engineer", "Junior Cloud Support Engineer", "Kijani Cloud Services", "Job", "remote", "Remote · Kenya", "Information technology", 21,
     "Entry-level cloud support role suited to alumni moving into technology.",
     "Support customers running workloads on AWS. Training is provided; experience with Linux, networking or IT support is helpful.",
     "Apply with your CV and a short cover note explaining your move into cloud technology."),
    ("cx-trainer", "Customer Experience Trainer", "Safari Hospitality Group", "Contract", "on_site", "Mombasa", "Hospitality", 45,
     "Six-month contract training hotel teams in service recovery.",
     "Design and deliver customer-service and service-recovery training for front-of-house teams across three coastal hotels.",
     "Share your CV and an outline of a training session you have delivered."),
    ("safety-volunteer", "Aviation Safety Mentor for Students", "Skyward Youth Programme", "Volunteer", "hybrid", "Nairobi", "Education", None,
     "Mentor aviation students preparing for careers in safety and quality.",
     "Meet a small group of students once a month to share real-world safety and quality experience.",
     "Express interest through the programme coordinator; a short introductory call follows."),
    ("finance-analyst", "Revenue Analyst", "Meridian Logistics", "Job", "on_site", "Nairobi", "Logistics", 14,
     "Revenue and pricing analysis role for a regional logistics company.",
     "Analyse route and customer profitability and support pricing decisions. Airline revenue management experience is valued.",
     "Apply with your CV and a summary of a pricing or revenue analysis you led."),
    ("hr-intern", "People and Culture Internship", "Tamu Foods", "Internship", "on_site", "Nairobi", "Food and beverage", 10,
     "Three-month internship for early-career alumni interested in HR.",
     "Support recruitment, onboarding and employee engagement projects.",
     "Send your CV and a short paragraph on why people operations interests you."),
    ("closed-role", "Ground Handling Supervisor", "Jambo Ground Services", "Job", "on_site", "Kisumu", "Aviation services", -5,
     "Supervisory role for ramp operations (closed listing for demonstration).",
     "Supervise ramp teams and coordinate aircraft turnarounds.",
     "Applications have closed."),
]


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
        counts = conn.execute("SELECT (SELECT count(*) FROM events WHERE synthetic), (SELECT count(*) FROM opportunities WHERE synthetic)").fetchone()
    print(f"{'Seeded' if apply else 'Preview'}: {len(EVENTS)} sample events and {len(OPPORTUNITIES)} sample opportunities defined; "
          f"database now has {counts[0]} sample events and {counts[1]} sample opportunities")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    try:
        seed(parser.parse_args().apply)
    except Exception as exc:
        print(f"Community seed failed ({type(exc).__name__}); rolled back", file=sys.stderr)
        sys.exit(1)
