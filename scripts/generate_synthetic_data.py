import csv
import random
from pathlib import Path

from synthetic_identity import FIXTURE_IDS

random.seed(42)

OUTPUT_DIR = Path("data")
OUTPUT_DIR.mkdir(exist_ok=True)

OUTPUT_FILE = OUTPUT_DIR / "synthetic_alumni.csv"

departments = {
    "Flight Operations": {
        "roles": ["First Officer", "Captain", "Flight Operations Officer"],
        "skills": ["Flight Planning", "Aviation Safety", "Crew Coordination", "Navigation"],
        "topics": ["Pilot career development", "Aviation operations", "Leadership in aviation"],
    },
    "Cabin Services": {
        "roles": ["Flight Attendant", "Cabin Crew Supervisor", "Purser"],
        "skills": ["Customer Service", "Safety Procedures", "Crew Coordination", "Conflict Resolution"],
        "topics": ["Cabin crew careers", "Customer experience", "Team leadership"],
    },
    "Engineering & Maintenance": {
        "roles": ["Aircraft Maintenance Engineer", "Maintenance Planner", "Technical Engineer"],
        "skills": ["Aircraft Maintenance", "Aviation Safety", "Maintenance Planning", "Technical Inspection"],
        "topics": ["Aviation engineering", "Technical careers", "Maintenance leadership"],
    },
    "ICT / Digital": {
        "roles": ["Software Engineer", "Systems Administrator", "Cloud Engineer", "Network Engineer"],
        "skills": ["AWS", "Docker", "Kubernetes", "Python", "Networking", "Cybersecurity"],
        "topics": ["Cloud engineering", "Software development", "DevOps", "Cybersecurity careers"],
    },
    "Finance": {
        "roles": ["Financial Analyst", "Accountant", "Finance Officer"],
        "skills": ["Financial Analysis", "Budgeting", "Excel", "Financial Reporting"],
        "topics": ["Finance careers", "Financial analysis", "Corporate finance"],
    },
    "Human Resources": {
        "roles": ["HR Officer", "Talent Acquisition Specialist", "HR Business Partner"],
        "skills": ["Recruitment", "Employee Relations", "Performance Management", "Training"],
        "topics": ["HR careers", "Recruitment", "People management"],
    },
    "Ground Operations": {
        "roles": ["Ground Operations Officer", "Ramp Supervisor", "Station Coordinator"],
        "skills": ["Ground Handling", "Operations Coordination", "Safety Compliance", "Logistics"],
        "topics": ["Airport operations", "Ground handling", "Operations leadership"],
    },
    "Cargo": {
        "roles": ["Cargo Officer", "Cargo Operations Supervisor", "Logistics Coordinator"],
        "skills": ["Cargo Handling", "Logistics", "Supply Chain", "Documentation"],
        "topics": ["Cargo careers", "Logistics", "Supply chain management"],
    },
    "Customer Experience": {
        "roles": ["Customer Service Agent", "Customer Experience Officer", "Service Quality Analyst"],
        "skills": ["Customer Service", "Communication", "Problem Solving", "Service Quality"],
        "topics": ["Customer experience", "Service careers", "Communication skills"],
    },
    "Commercial": {
        "roles": ["Sales Executive", "Revenue Analyst", "Marketing Officer"],
        "skills": ["Sales", "Marketing", "Revenue Management", "Market Analysis"],
        "topics": ["Commercial careers", "Sales", "Marketing", "Revenue management"],
    },
    "Safety & Quality": {
        "roles": ["Safety Officer", "Quality Assurance Officer", "Compliance Analyst"],
        "skills": ["Risk Assessment", "Quality Assurance", "Compliance", "Safety Management"],
        "topics": ["Aviation safety", "Quality assurance", "Compliance careers"],
    },
    "Corporate Services": {
        "roles": ["Procurement Officer", "Legal Officer", "Administration Officer"],
        "skills": ["Procurement", "Contract Management", "Administration", "Negotiation"],
        "topics": ["Corporate careers", "Procurement", "Administration"],
    },
}

first_names = [
    "Amina", "Brian", "Cynthia", "Daniel", "Esther", "Faith", "George", "Hassan",
    "Irene", "James", "Kevin", "Linda", "Michael", "Naomi", "Peter", "Rachel",
    "Samuel", "Terry", "Victor", "Wanjiku"
]

last_names = [
    "Mwangi", "Otieno", "Kamau", "Achieng", "Wambui", "Kiptoo", "Mutua", "Njeri",
    "Omondi", "Muthoni", "Kariuki", "Wafula", "Chebet", "Maina", "Odhiambo"
]

current_organisations = [
    "SkyTech Solutions",
    "East Africa Logistics",
    "Aero Systems Ltd",
    "CloudWorks Africa",
    "Nairobi Digital Services",
    "Global Aviation Services",
    "Independent Consultant",
    "Regional Air Services",
]

locations = [
    "Nairobi",
    "Mombasa",
    "Kisumu",
    "Nakuru",
    "Eldoret",
]

industries = [
    "Aviation",
    "Technology",
    "Finance",
    "Logistics",
    "Consulting",
    "Telecommunications",
]

rows = []

for synthetic_id in FIXTURE_IDS:
    department = random.choice(list(departments.keys()))
    department_data = departments[department]

    former_role = random.choice(department_data["roles"])
    skills = random.sample(
        department_data["skills"],
        k=min(3, len(department_data["skills"]))
    )

    start_year = random.randint(2005, 2019)
    end_year = random.randint(start_year + 1, 2025)

    full_name = f"{random.choice(first_names)} {random.choice(last_names)}"
    current_title = random.choice(department_data["roles"])

    headline = f"{current_title} with experience in {', '.join(skills[:2])}"

    biography = (
        f"Former Kenya Airways professional with experience in {department}. "
        f"Skilled in {', '.join(skills)}. "
        f"Interested in supporting professionals through mentorship and career guidance."
    )

    rows.append({
        "synthetic_id": synthetic_id,
        "full_name": full_name,
        "former_kq_role": former_role,
        "former_kq_department": department,
        "kq_start_year": start_year,
        "kq_end_year": end_year,
        "current_job_title": current_title,
        "current_organization": random.choice(current_organisations),
        "industry": random.choice(industries),
        "location": random.choice(locations),
        "headline": headline,
        "biography": biography,
        "skills": "|".join(skills),
        "mentorship_topics": "|".join(department_data["topics"]),
        "available_for_mentorship": random.choice([True, True, True, False]),
        "consent_to_matching": random.choice([True, True, True, False]),
    })

fieldnames = rows[0].keys()

with OUTPUT_FILE.open("w", newline="", encoding="utf-8") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"Generated {len(rows)} synthetic alumni profiles.")
print(f"Saved to: {OUTPUT_FILE}")