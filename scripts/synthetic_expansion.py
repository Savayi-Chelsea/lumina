"""Deterministic generator for synthetic alumni ALUM-051..ALUM-200 and work histories.

Uses its own seeded random generators, so the original Sprint I rows (produced by
generate_synthetic_data.py's global sequence) are never affected. Every name and
organization is fictional.
"""
import random

# Where each department's alumni plausibly went next: (title, industry, organizations).
CAREER_PATHS = {
    "Flight Operations": [
        ("Captain", "Aviation", ["Savannah Air Charters", "Regional Air Services", "Rift Valley Aviation"]),
        ("Flight Instructor", "Education", ["Horizon Flight Academy", "Skyward Aviation School"]),
        ("Flight Operations Manager", "Aviation", ["Global Aviation Services", "Equator Cargo Airlines"]),
        ("Aviation Safety Consultant", "Consulting", ["Independent Consultant", "AeroAssure Advisory"]),
    ],
    "Cabin Services": [
        ("Cabin Crew Trainer", "Education", ["Skyward Aviation School", "Horizon Flight Academy"]),
        ("Guest Experience Manager", "Hospitality", ["Safari Hospitality Group", "Coastline Resorts"]),
        ("Customer Success Lead", "Technology", ["Nairobi Digital Services", "Kijani Cloud Services"]),
        ("Purser", "Aviation", ["Regional Air Services", "Gulf Horizon Airways"]),
    ],
    "Engineering & Maintenance": [
        ("Licensed Aircraft Engineer", "Aviation", ["Aero Systems Ltd", "Rift Valley Aviation"]),
        ("Reliability Engineer", "Aviation", ["Global Aviation Services", "AeroTech MRO"]),
        ("Maintenance Manager", "Manufacturing", ["Tamu Industrial", "East Africa Engineering Works"]),
        ("Engineering Consultant", "Consulting", ["AeroAssure Advisory", "Independent Consultant"]),
    ],
    "ICT / Digital": [
        ("Cloud Engineer", "Technology", ["CloudWorks Africa", "Kijani Cloud Services"]),
        ("DevOps Engineer", "Technology", ["SkyTech Solutions", "Nairobi Digital Services"]),
        ("Cybersecurity Analyst", "Finance", ["Mkopo Fintech", "Harambee Bank"]),
        ("Data Engineer", "Telecommunications", ["Safiri Telecom", "CloudWorks Africa"]),
        ("IT Manager", "Logistics", ["East Africa Logistics", "Meridian Logistics"]),
    ],
    "Finance": [
        ("Financial Analyst", "Finance", ["Harambee Bank", "Mkopo Fintech"]),
        ("Finance Manager", "Logistics", ["Meridian Logistics", "East Africa Logistics"]),
        ("Audit Associate", "Consulting", ["Baobab Advisory", "Independent Consultant"]),
        ("Revenue Accountant", "Hospitality", ["Safari Hospitality Group", "Coastline Resorts"]),
    ],
    "Human Resources": [
        ("HR Business Partner", "Technology", ["SkyTech Solutions", "Safiri Telecom"]),
        ("Talent Acquisition Lead", "Finance", ["Harambee Bank", "Mkopo Fintech"]),
        ("People and Culture Manager", "Food and beverage", ["Tamu Foods", "Tamu Industrial"]),
        ("Leadership Coach", "Consulting", ["Baobab Advisory", "Independent Consultant"]),
    ],
    "Ground Operations": [
        ("Station Manager", "Aviation", ["Jambo Ground Services", "Regional Air Services"]),
        ("Airport Operations Manager", "Aviation", ["Global Aviation Services", "Jambo Ground Services"]),
        ("Operations Lead", "Logistics", ["Meridian Logistics", "East Africa Logistics"]),
        ("Fleet Operations Supervisor", "Transport", ["Safiri Mobility", "Tamu Industrial"]),
    ],
    "Cargo": [
        ("Logistics Manager", "Logistics", ["East Africa Logistics", "Meridian Logistics"]),
        ("Supply Chain Analyst", "Food and beverage", ["Tamu Foods", "Tamu Industrial"]),
        ("Freight Operations Lead", "Aviation", ["Equator Cargo Airlines", "Jambo Ground Services"]),
        ("Customs and Compliance Officer", "Logistics", ["Meridian Logistics", "Bandari Freight"]),
    ],
    "Customer Experience": [
        ("Customer Experience Manager", "Telecommunications", ["Safiri Telecom", "Harambee Bank"]),
        ("Service Design Lead", "Technology", ["Nairobi Digital Services", "Mkopo Fintech"]),
        ("Contact Centre Manager", "Finance", ["Harambee Bank", "Mkopo Fintech"]),
        ("Guest Relations Manager", "Hospitality", ["Coastline Resorts", "Safari Hospitality Group"]),
    ],
    "Commercial": [
        ("Revenue Manager", "Hospitality", ["Safari Hospitality Group", "Coastline Resorts"]),
        ("Marketing Manager", "Telecommunications", ["Safiri Telecom", "Nairobi Digital Services"]),
        ("Business Development Manager", "Logistics", ["Meridian Logistics", "Bandari Freight"]),
        ("Pricing Analyst", "Aviation", ["Gulf Horizon Airways", "Regional Air Services"]),
    ],
    "Safety & Quality": [
        ("Safety Manager", "Aviation", ["Rift Valley Aviation", "Global Aviation Services"]),
        ("Quality Assurance Lead", "Manufacturing", ["Tamu Industrial", "East Africa Engineering Works"]),
        ("Health and Safety Advisor", "Energy", ["Kenya Geothermal Partners", "Tamu Industrial"]),
        ("Compliance Manager", "Finance", ["Harambee Bank", "Mkopo Fintech"]),
    ],
    "Corporate Services": [
        ("Procurement Manager", "Logistics", ["East Africa Logistics", "Bandari Freight"]),
        ("Legal Counsel", "Consulting", ["Baobab Advisory", "Independent Consultant"]),
        ("Operations Administrator", "Education", ["Horizon Flight Academy", "Skyward Aviation School"]),
        ("Contracts Manager", "Energy", ["Kenya Geothermal Partners", "Tamu Industrial"]),
    ],
}

EXTRA_SKILLS = {
    "Flight Operations": ["Crew Resource Management", "Flight Training", "Operations Control"],
    "Cabin Services": ["Training Delivery", "Service Recovery", "First Aid"],
    "Engineering & Maintenance": ["Reliability Engineering", "Root Cause Analysis", "Technical Documentation"],
    "ICT / Digital": ["Terraform", "CI/CD", "Linux", "SQL", "Data Engineering"],
    "Finance": ["Audit", "Forecasting", "IFRS"],
    "Human Resources": ["Coaching", "Organisational Development", "Talent Management"],
    "Ground Operations": ["Turnaround Planning", "Team Supervision", "Resource Planning"],
    "Cargo": ["Customs Compliance", "Warehouse Management", "Freight Forwarding"],
    "Customer Experience": ["Service Design", "Customer Analytics", "Complaint Handling"],
    "Commercial": ["Pricing Strategy", "Digital Marketing", "Partnership Management"],
    "Safety & Quality": ["Incident Investigation", "Auditing", "ISO 9001"],
    "Corporate Services": ["Legal Drafting", "Vendor Management", "Policy Development"],
}

EXTRA_TOPICS = {
    "ICT / Digital": ["Moving into technology from aviation"],
    "Cabin Services": ["Moving from cabin crew into hospitality"],
    "Cargo": ["Logistics leadership"],
    "Ground Operations": ["Moving from aviation into logistics"],
    "Finance": ["Moving from aviation finance into banking"],
}

FIRST_NAMES = ["Akinyi", "Baraka", "Chepkoech", "David", "Eunice", "Felix", "Grace", "Halima", "Isaac", "Joy",
               "Kamau", "Lilian", "Moses", "Nafula", "Omar", "Purity", "Quentin", "Rehema", "Stephen", "Tabitha",
               "Umi", "Vincent", "Winnie", "Yusuf", "Zawadi", "Agnes", "Collins", "Dorcas", "Edwin", "Gladys"]
LAST_NAMES = ["Wanjiru", "Ochieng", "Kiprono", "Nyambura", "Mohamed", "Barasa", "Jeptoo", "Gitau", "Awuor", "Mbugua",
              "Korir", "Atieno", "Njoroge", "Wekesa", "Rotich", "Kimani", "Adhiambo", "Ndungu", "Langat", "Mwende"]
LOCATIONS = ["Nairobi"] * 8 + ["Mombasa"] * 3 + ["Kisumu"] * 2 + ["Nakuru", "Eldoret", "Nyeri", "Kigali", "Dubai", "London", "Johannesburg", "Doha"]
HEADLINES = [
    "{title} · former Kenya Airways {former}",
    "{title} bringing {skill} experience from aviation",
    "From {department} to {industry}: {title}",
    "{title} focused on {skill} and {skill2}",
]
BIOGRAPHIES = [
    "Spent {years} years in {department} at Kenya Airways as a {former}, then moved into {industry} as a {title}. Brings {skills} to every team.",
    "Former {former} in {department}. Now working as a {title} in {industry}, drawing on {skills}. Happy to help colleagues plan a similar move.",
    "Aviation taught me discipline and teamwork. After {years} years in {department}, I became a {title}. My work today centres on {skills}.",
]


def expansion_rows(identities, departments, taken_names):
    """150 profiles spread evenly across all 12 departments."""
    rng = random.Random(2026)
    names = list(departments)
    rows = []
    taken = set(taken_names)
    for index, synthetic_id in enumerate(identities):
        department = names[index % len(names)]
        data = departments[department]
        former = rng.choice(data["roles"])
        title, industry, organizations = rng.choice(CAREER_PATHS[department])
        skill_pool = sorted(set(data["skills"]) | set(EXTRA_SKILLS[department]))
        skills = rng.sample(skill_pool, k=rng.randint(3, 5))
        start = rng.randint(1996, 2016)
        end = rng.randint(start + 3, min(start + 22, 2024))
        while True:
            full_name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
            if full_name not in taken:
                taken.add(full_name)
                break
        fields = {"title": title, "former": former, "department": department, "industry": industry.lower(),
                  "skill": skills[0], "skill2": skills[1], "skills": ", ".join(skills[:3]), "years": end - start}
        rows.append({
            "synthetic_id": synthetic_id,
            "full_name": full_name,
            "former_kq_role": former,
            "former_kq_department": department,
            "kq_start_year": start,
            "kq_end_year": end,
            "current_job_title": title,
            "current_organization": rng.choice(organizations),
            "industry": industry,
            "location": rng.choice(LOCATIONS),
            "headline": rng.choice(HEADLINES).format(**fields),
            "biography": rng.choice(BIOGRAPHIES).format(**fields),
            "skills": "|".join(skills),
            "mentorship_topics": "|".join(data["topics"] + EXTRA_TOPICS.get(department, [])),
            "available_for_mentorship": rng.random() < 0.75,
            "consent_to_matching": rng.random() < 0.82,
        })
    return rows


def work_history_rows(rows):
    """Kenya Airways role, an optional intermediate role, and the current role for every profile."""
    history = []
    for row in rows:
        rng = random.Random(f"work:{row['synthetic_id']}")
        department = row["former_kq_department"]
        end = int(row["kq_end_year"])
        history.append({"synthetic_id": row["synthetic_id"], "organization": "Kenya Airways", "job_title": row["former_kq_role"],
                        "start_year": row["kq_start_year"], "end_year": end, "is_current": False,
                        "description": f"{row['former_kq_role']} in {department}."})
        current_start = min(end + rng.randint(0, 2), 2025)
        if current_start - end >= 1 or rng.random() < 0.4:
            title, _, organizations = rng.choice(CAREER_PATHS[department])
            middle_end = max(end + 1, min(current_start + 1, 2024))
            if title != row["current_job_title"]:
                history.append({"synthetic_id": row["synthetic_id"], "organization": rng.choice(organizations), "job_title": title,
                                "start_year": end, "end_year": middle_end, "is_current": False,
                                "description": f"Applied {department.lower()} experience as {title}."})
                current_start = middle_end
        history.append({"synthetic_id": row["synthetic_id"], "organization": row["current_organization"], "job_title": row["current_job_title"],
                        "start_year": min(current_start, 2025), "end_year": "", "is_current": True,
                        "description": f"Current role in {row['industry'].lower()}."})
    return history
