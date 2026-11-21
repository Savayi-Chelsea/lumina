"""Deterministic generator for the evaluation-only profiles ALUM-201..ALUM-500.

Used by scripts/generate_evaluation_dataset.py to build a 500-profile evaluation
dataset whose first 200 rows are the unchanged demo dataset (data/synthetic_alumni.csv).
Independent seeded generators are used, so the existing 200 profiles are never altered.
Every person, organisation and place-of-work name here is fictional.

Each new profile has an experience level (early, mid, senior, executive) and a career
path after Kenya Airways of one of three kinds: staying in aviation, moving to an
adjacent field, or changing career. Titles, skills, mentorship topics and work history
follow from those choices, so a profile is internally consistent:
  * KQ tenure and start year follow the experience level;
  * work history runs KQ role(s) -> (previous post-KQ role) -> current role, in year order;
  * career changers enter the new field one seniority step lower than in aviation;
  * senior people carry leadership skills; topics reflect the move they made.
"""
import random

SEED = 5002026
LEVELS = ("early", "mid", "senior", "executive")
LEVEL_WEIGHTS = (0.25, 0.40, 0.25, 0.10)
# (start-year range, KQ tenure range) per level.
CAREER_SPAN = {"early": ((2013, 2019), (3, 6)), "mid": ((2004, 2013), (5, 12)),
               "senior": ((1996, 2006), (9, 18)), "executive": ((1990, 2000), (12, 24))}
CONSENT_RATE = 0.845  # baseline: 169 of 200
AVAILABILITY_RATE = {"early": 0.82, "mid": 0.80, "senior": 0.78, "executive": 0.70}  # baseline overall: 160 of 200
# KQ roles that come after years of experience; early-career alumni never hold them,
# and long careers reach them from a junior role.
SENIOR_KQ_ROLES = {"Captain", "Cabin Crew Supervisor", "Purser", "HR Business Partner", "Ramp Supervisor",
                   "Cargo Operations Supervisor", "Service Quality Analyst"}
TECH_PATHS = {"software", "cloud", "data", "security", "product"}
# How the field is described in a biography (industry names alone read oddly for career changes).
FIELDS = {"software": "software development", "cloud": "cloud engineering", "data": "data analytics", "security": "cybersecurity",
          "product": "product management", "renewables": "renewable energy", "ngo": "international development",
          "healthcare": "healthcare management", "education": "teaching", "government": "public service",
          "real_estate": "real estate", "agribusiness": "agribusiness", "entrepreneur": "running my own business",
          "communications": "communications"}
LEADERSHIP_SKILLS = ["Team Leadership", "People Management", "Strategic Planning", "Change Management", "Stakeholder Management"]

# Career destinations: industry, organisations, titles by level, skills, the mentorship
# topic someone on that path offers, and the kind of move it is from aviation.
DESTINATIONS = {
    "airline_pilot": ("Aviation", ["Savannah Air Charters", "Regional Air Services", "Gulf Horizon Airways", "Rift Valley Aviation"],
                      ["First Officer", "Captain", "Senior Captain", "Director of Flight Operations"],
                      ["Flight Planning", "Crew Resource Management", "Navigation", "Aviation Safety"], "Pilot career development", "aviation"),
    "flight_training": ("Education", ["Horizon Flight Academy", "Skyward Aviation School"],
                        ["Flight Instructor", "Senior Flight Instructor", "Head of Training", "Director of Training"],
                        ["Flight Training", "Training Delivery", "Curriculum Design", "Coaching"], "Teaching and training careers", "adjacent"),
    "aviation_safety": ("Aviation", ["Rift Valley Aviation", "AeroAssure Advisory", "Regional Aviation Safety Board"],
                        ["Safety Officer", "Safety Manager", "Head of Safety", "Director of Safety and Quality"],
                        ["Safety Management", "Risk Assessment", "Incident Investigation", "Auditing"], "Aviation safety", "aviation"),
    "mro_engineering": ("Aviation", ["AeroTech MRO", "Aero Systems Ltd", "Equator Aircraft Services"],
                        ["Aircraft Maintenance Engineer", "Licensed Aircraft Engineer", "Maintenance Manager", "Director of Engineering"],
                        ["Aircraft Maintenance", "Maintenance Planning", "Reliability Engineering", "Technical Inspection"], "Aviation engineering", "aviation"),
    "airport_ops": ("Aviation", ["Jambo Ground Services", "Global Aviation Services"],
                    ["Airport Operations Officer", "Station Manager", "Airport Operations Manager", "General Manager, Airport Operations"],
                    ["Ground Handling", "Turnaround Planning", "Team Supervision", "Operations Coordination"], "Airport operations", "aviation"),
    "cabin_aviation": ("Aviation", ["Gulf Horizon Airways", "Regional Air Services"],
                       ["Cabin Crew Trainer", "Purser", "Cabin Services Manager", "Head of Cabin Services"],
                       ["Customer Service", "Training Delivery", "Safety Procedures", "Service Recovery"], "Cabin crew careers", "aviation"),
    "air_cargo": ("Aviation", ["Equator Cargo Airlines", "Bandari Freight"],
                  ["Cargo Agent", "Freight Operations Lead", "Cargo Operations Manager", "Head of Cargo"],
                  ["Cargo Handling", "Freight Forwarding", "Customs Compliance", "Dangerous Goods"], "Cargo careers", "aviation"),
    "logistics": ("Logistics", ["East Africa Logistics", "Meridian Logistics", "Bandari Freight"],
                  ["Logistics Coordinator", "Logistics Manager", "Head of Logistics", "Chief Operating Officer"],
                  ["Supply Chain", "Logistics", "Warehouse Management", "Fleet Management"], "Moving from aviation into logistics", "adjacent"),
    "hospitality": ("Hospitality", ["Safari Hospitality Group", "Coastline Resorts"],
                    ["Guest Relations Officer", "Guest Experience Manager", "Hotel Operations Manager", "General Manager"],
                    ["Guest Experience", "Service Recovery", "Hospitality Management", "Customer Service"], "Moving from cabin crew into hospitality", "adjacent"),
    "tourism": ("Tourism", ["Savannah Trails Tours", "Maasai Horizons Travel"],
                ["Travel Consultant", "Tour Operations Manager", "Head of Tourism Partnerships", "Managing Director"],
                ["Tour Operations", "Travel Planning", "Partnership Management", "Customer Service"], "Careers in tourism", "adjacent"),
    "customer_experience": ("Telecommunications", ["Safiri Telecom", "Harambee Bank"],
                            ["Customer Experience Analyst", "Customer Experience Manager", "Head of Customer Experience", "Chief Customer Officer"],
                            ["Customer Analytics", "Service Design", "Complaint Handling", "Customer Service"], "Customer experience", "adjacent"),
    "banking_finance": ("Finance", ["Harambee Bank", "Mkopo Fintech"],
                        ["Financial Analyst", "Finance Manager", "Head of Finance", "Chief Financial Officer"],
                        ["Financial Analysis", "IFRS", "Financial Reporting", "Budgeting"], "Moving from aviation finance into banking", "adjacent"),
    "audit": ("Consulting", ["Baobab Advisory", "Mizani Assurance"],
              ["Audit Associate", "Audit Manager", "Senior Audit Manager", "Audit Partner"],
              ["Audit", "IFRS", "Internal Controls", "Risk Assessment"], "Finance careers", "adjacent"),
    "procurement": ("Energy", ["Kenya Geothermal Partners", "Tamu Industrial"],
                    ["Procurement Officer", "Procurement Manager", "Head of Procurement", "Chief Procurement Officer"],
                    ["Procurement", "Contract Management", "Negotiation", "Vendor Management"], "Procurement", "adjacent"),
    "hr": ("Technology", ["SkyTech Solutions", "Harambee Bank", "Safiri Telecom"],
           ["HR Officer", "HR Business Partner", "Head of People", "Chief People Officer"],
           ["Recruitment", "Employee Relations", "Talent Management", "Organisational Development"], "CV and interview preparation", "adjacent"),
    "coaching": ("Consulting", ["Baobab Advisory", "Independent Consultant"],
                 ["Career Coach", "Leadership Coach", "Principal Coach", "Founder, Coaching Practice"],
                 ["Coaching", "Leadership Development", "Training Delivery", "Career Planning"], "Career change after aviation", "adjacent"),
    "quality": ("Manufacturing", ["Tamu Industrial", "East Africa Engineering Works"],
                ["Quality Officer", "Quality Assurance Lead", "Quality Manager", "Head of Quality"],
                ["ISO 9001", "Quality Management", "Auditing", "Root Cause Analysis"], "Quality assurance", "adjacent"),
    "marketing": ("Telecommunications", ["Safiri Telecom", "Nairobi Digital Services"],
                  ["Marketing Executive", "Marketing Manager", "Head of Marketing", "Chief Marketing Officer"],
                  ["Digital Marketing", "Brand Management", "Marketing", "Market Research"], "Marketing", "adjacent"),
    "revenue": ("Hospitality", ["Safari Hospitality Group", "Coastline Resorts"],
                ["Revenue Analyst", "Revenue Manager", "Head of Revenue", "Commercial Director"],
                ["Revenue Management", "Pricing Strategy", "Forecasting", "Data Analysis"], "Revenue management", "adjacent"),
    "sales": ("Logistics", ["Meridian Logistics", "Bandari Freight", "Nairobi Digital Services"],
              ["Sales Executive", "Business Development Manager", "Head of Sales", "Commercial Director"],
              ["Sales", "Business Development", "Negotiation", "Account Management"], "Sales", "adjacent"),
    "legal": ("Consulting", ["Baobab Advisory", "Mizani Legal Partners"],
              ["Legal Associate", "Legal Counsel", "Head of Legal", "General Counsel"],
              ["Legal Drafting", "Contract Management", "Regulatory Compliance", "Negotiation"], "Corporate careers", "adjacent"),
    "software": ("Technology", ["Nairobi Digital Services", "SkyTech Solutions", "Kijani Cloud Services"],
                 ["Software Developer", "Software Engineer", "Senior Software Engineer", "Head of Engineering"],
                 ["Software Development", "JavaScript", "React", "Python", "Git"], "Moving into technology from aviation", "change"),
    "cloud": ("Technology", ["CloudWorks Africa", "Kijani Cloud Services"],
              ["Cloud Engineer", "DevOps Engineer", "Senior DevOps Engineer", "Head of Cloud Platforms"],
              ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux"], "Cloud engineering", "change"),
    "data": ("Telecommunications", ["Safiri Telecom", "CloudWorks Africa", "Mkopo Fintech"],
             ["Data Analyst", "Data Engineer", "Analytics Manager", "Head of Data"],
             ["SQL", "Python", "Power BI", "Data Engineering", "Data Analysis"], "Moving into data careers", "change"),
    "security": ("Finance", ["Mkopo Fintech", "Harambee Bank"],
                 ["Cybersecurity Analyst", "Cybersecurity Engineer", "Information Security Manager", "Chief Information Security Officer"],
                 ["Cybersecurity", "Network Security", "Incident Response", "Risk Assessment"], "Cybersecurity careers", "change"),
    "product": ("Technology", ["Mkopo Fintech", "Nairobi Digital Services"],
                ["Associate Product Manager", "Product Manager", "Senior Product Manager", "Head of Product"],
                ["Product Management", "Agile", "User Research", "Stakeholder Management"], "Moving into product management", "change"),
    "renewables": ("Energy", ["Kenya Geothermal Partners", "Jua Power Solutions", "Upepo Wind Energy"],
                   ["Solar Installation Technician", "Renewable Energy Engineer", "Energy Projects Manager", "Director of Renewable Energy"],
                   ["Solar PV", "Renewable Energy", "Electrical Systems", "Project Management"], "Moving into renewable energy", "change"),
    "ngo": ("Non-profit", ["Pamoja Development Trust", "Afya Bora Foundation"],
            ["Programme Officer", "Programme Manager", "Country Programme Director", "Executive Director"],
            ["Program Management", "Monitoring and Evaluation", "Grant Writing", "Stakeholder Management"], "Working in development and NGOs", "change"),
    "healthcare": ("Healthcare", ["Uzima Medical Centre", "Afya Health Network"],
                   ["Patient Experience Officer", "Hospital Operations Manager", "Head of Hospital Operations", "Chief Operating Officer"],
                   ["Healthcare Operations", "Patient Experience", "Quality Management", "Process Improvement"], "Moving into healthcare", "change"),
    "education": ("Education", ["Kilele Technical College", "Mwangaza University College"],
                  ["Teaching Assistant", "Lecturer", "Senior Lecturer", "Head of Department"],
                  ["Teaching", "Curriculum Design", "Training Delivery", "Research"], "Teaching and training careers", "change"),
    "government": ("Government", ["National Transport Policy Unit", "County Transport Department"],
                   ["Policy Officer", "Senior Policy Analyst", "Deputy Director", "Director of Transport Policy"],
                   ["Public Policy", "Regulatory Affairs", "Report Writing", "Stakeholder Management"], "Careers in public service", "change"),
    "real_estate": ("Real Estate", ["Makazi Homes", "Ardhi Property Partners"],
                    ["Property Sales Agent", "Property Manager", "Head of Property Management", "Managing Director"],
                    ["Property Management", "Sales", "Negotiation", "Customer Service"], "Moving into real estate", "change"),
    "agribusiness": ("Agriculture", ["Shamba Fresh Exports", "Kilimo Agritech"],
                     ["Agribusiness Officer", "Agribusiness Manager", "Head of Agribusiness", "Managing Director"],
                     ["Agribusiness", "Export Logistics", "Supply Chain", "Quality Management"], "Agribusiness careers", "change"),
    "entrepreneur": ("Small business", ["Jamii Events Company", "Bahari Travel Concierge", "Nyota Consulting", "Safari Snacks Ltd"],
                     ["Co-founder", "Founder", "Founder and Managing Director", "Founder and CEO"],
                     ["Business Planning", "Fundraising", "Sales", "Financial Management"], "Starting a business", "change"),
    "communications": ("Media", ["Sauti Media Group", "Tembo Communications"],
                       ["Communications Officer", "Communications Manager", "Head of Communications", "Director of Communications"],
                       ["Public Relations", "Content Strategy", "Media Relations", "Crisis Communication"], "Communications careers", "change"),
}

# Where each department's alumni go next (relative weights).
PATHS = {
    "Flight Operations": {"airline_pilot": 4, "flight_training": 3, "aviation_safety": 2, "government": 1, "entrepreneur": 1, "coaching": 1, "tourism": 1, "education": 1},
    "Cabin Services": {"cabin_aviation": 3, "hospitality": 3, "tourism": 2, "customer_experience": 2, "real_estate": 1, "healthcare": 1, "software": 1, "entrepreneur": 1, "coaching": 1, "hr": 1},
    "Engineering & Maintenance": {"mro_engineering": 4, "quality": 2, "renewables": 2, "aviation_safety": 1, "software": 1, "education": 1, "entrepreneur": 1},
    "ICT / Digital": {"software": 3, "cloud": 3, "data": 2, "security": 2, "product": 2, "entrepreneur": 1, "education": 1},
    "Finance": {"banking_finance": 4, "audit": 2, "data": 1, "product": 1, "ngo": 1, "real_estate": 1, "entrepreneur": 1},
    "Human Resources": {"hr": 4, "coaching": 3, "ngo": 1, "education": 1, "government": 1, "healthcare": 1},
    "Ground Operations": {"airport_ops": 4, "logistics": 3, "hospitality": 1, "government": 1, "entrepreneur": 1, "agribusiness": 1},
    "Cargo": {"air_cargo": 3, "logistics": 4, "agribusiness": 2, "procurement": 1, "entrepreneur": 1},
    "Customer Experience": {"customer_experience": 3, "hospitality": 2, "healthcare": 1, "product": 1, "coaching": 1, "real_estate": 1, "tourism": 1},
    "Commercial": {"revenue": 3, "marketing": 3, "sales": 3, "tourism": 1, "product": 1, "entrepreneur": 1, "communications": 1},
    "Safety & Quality": {"aviation_safety": 4, "quality": 3, "healthcare": 1, "government": 1, "renewables": 1, "audit": 1},
    "Corporate Services": {"procurement": 3, "legal": 2, "ngo": 1, "government": 2, "real_estate": 1, "communications": 1, "hr": 1},
}

FIRST_NAMES = ["Abdi", "Beatrice", "Caroline", "Dennis", "Edith", "Francis", "Gideon", "Hellen", "Ibrahim", "Janet", "Kennedy",
               "Lucy", "Mercy", "Nelson", "Olive", "Patrick", "Ruth", "Sharon", "Tom", "Valentine", "Wycliffe", "Yvonne", "Zainab",
               "Alice", "Benard", "Charity", "Dominic", "Emmanuel", "Florence", "Hilda", "Josephine", "Kelvin", "Margaret", "Nicholas",
               "Priscilla", "Rose", "Simon", "Teresa", "Wilson", "Ann"]
LAST_NAMES = ["Kibet", "Nyongesa", "Owino", "Cherono", "Gachanja", "Haji", "Juma", "Kosgei", "Makau", "Ndegwa", "Odera", "Sang",
              "Too", "Waweru", "Ali", "Kemunto", "Lagat", "Mueni", "Nyaga", "Ouma", "Ruto", "Simiyu", "Tanui", "Wairimu", "Yegon"]
LOCATIONS = ["Nairobi"] * 9 + ["Mombasa"] * 3 + ["Kisumu"] * 2 + ["Nakuru", "Eldoret", "Nyeri", "Thika", "Machakos", "Kigali", "Kampala",
                                                                 "Dubai", "Doha", "London", "Johannesburg"]
HEADLINES = {
    "aviation": ["{title} · former Kenya Airways {former}", "{title} at {org}", "{title} with {total_years}+ years in aviation",
                 "{title} focused on {skill} and {skill2}"],
    "adjacent": ["{title} at {org} · ex-Kenya Airways {former}", "From {department} to {industry}: {title}",
                 "{title} bringing {skill} experience from aviation", "{title} focused on {skill} and {skill2}"],
    "change": ["From {former} to {title}", "{title} · career changer from aviation", "{title} at {org}, formerly Kenya Airways {department}",
               "{title} working on {skill} and {skill2}"],
}
STORY = {
    "aviation": ["Spent {kq_years} years at Kenya Airways as {former_a} in {department} and stayed in aviation.",
                 "After {kq_years} years with Kenya Airways in {department}, I continued my aviation career outside the national carrier."],
    "adjacent": ["My {kq_years} years in {department} at Kenya Airways led naturally into {industry_lower}.",
                 "I moved from Kenya Airways {department} into {industry_lower}, where much of what I learned still applies."],
    "change": ["I left Kenya Airways after {kq_years} years as {former_a} and retrained for a career in {industry_lower}.",
               "Changing careers after {kq_years} years in {department} was a big step: I started again in {industry_lower}."],
}
NOW = ["Today I work as {title_a} at {org}, mainly on {skills}.", "I am now {title_a} at {org}; my work centres on {skills}.",
       "Currently {title_a} at {org}, using {skills} every day."]
CLOSING = {"early": ["I am still early in this field and happy to share what the first steps were like."],
           "mid": ["Happy to help colleagues plan a similar move.", "I enjoy mentoring people who are a few steps behind me."],
           "senior": ["I lead teams and budgets and enjoy developing new managers.", "I mentor managers on leading people through change."],
           "executive": ["I sit on the leadership team and mentor future leaders.", "I am glad to talk about leadership at the top of an organisation."]}


def article(text):
    return ("an " if text[0].lower() in "aeiou" else "a ") + text


def evaluation_rows(identities, departments, taken_names):
    """One profile per identity, spread evenly across the 12 departments."""
    rng = random.Random(SEED)
    names = list(departments)
    order = [names[i % len(names)] for i in range(len(identities))]
    rng.shuffle(order)
    taken = set(taken_names)
    rows, meta = [], []
    for synthetic_id, department in zip(identities, order):
        data = departments[department]
        level = rng.choices(LEVELS, weights=LEVEL_WEIGHTS)[0]
        level_index = LEVELS.index(level)
        destination = rng.choices(list(PATHS[department]), weights=list(PATHS[department].values()))[0]
        industry, organizations, titles, dest_skills, dest_topic, kind = DESTINATIONS[destination]
        if department == "ICT / Digital" and destination in TECH_PATHS:
            kind = "adjacent"  # same profession, new industry: not a career change
        # Career changers usually re-enter one seniority step lower.
        title_index = max(0, level_index - 1) if kind == "change" else level_index
        title = titles[title_index]
        (start_low, start_high), (tenure_low, tenure_high) = CAREER_SPAN[level]
        start = rng.randint(start_low, start_high)
        end = min(start + rng.randint(tenure_low, tenure_high), 2024)
        junior = [role for role in data["roles"] if role not in SENIOR_KQ_ROLES]
        senior = [role for role in data["roles"] if role in SENIOR_KQ_ROLES]
        if level == "early":
            former = rng.choice(junior)
        elif level in ("senior", "executive") and senior and rng.random() < 0.7:
            former = rng.choice(senior)
        else:
            former = rng.choice(data["roles"])
        organization = rng.choice(organizations)
        current_skills = rng.sample(dest_skills, rng.randint(2, 3))
        skills = list(dict.fromkeys(rng.sample(data["skills"], 2) + current_skills
                                    + (rng.sample(LEADERSHIP_SKILLS, rng.randint(1, 2)) if level in ("senior", "executive")
                                       else rng.sample(LEADERSHIP_SKILLS, 1) if level == "mid" and rng.random() < 0.3 else [])))
        topics = rng.sample(data["topics"], rng.randint(1, 2)) + [dest_topic]
        if level in ("senior", "executive") and rng.random() < 0.6:
            topics.append("Leadership development")
        if (kind == "change" and rng.random() < 0.7) or (kind == "adjacent" and rng.random() < 0.35):
            topics.append("Career change after aviation")
        if rng.random() < 0.2:
            topics.append("Networking and personal branding")
        if rng.random() < (0.7 if destination in ("hr", "coaching") else 0.12):
            topics.append("CV and interview preparation")
        topics = list(dict.fromkeys(topics))
        while True:
            full_name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
            if full_name not in taken:
                taken.add(full_name)
                break
        fields = {"title": title, "title_a": article(title), "former": former, "former_a": article(former), "department": department,
                  "industry": industry, "industry_lower": FIELDS.get(destination, industry.lower()), "org": organization,
                  "skill": current_skills[0], "skill2": current_skills[1],
                  "skills": ", ".join(skills[2:5] or skills[:3]), "kq_years": end - start, "total_years": 2025 - start}
        rows.append({
            "synthetic_id": synthetic_id, "full_name": full_name, "former_kq_role": former, "former_kq_department": department,
            "kq_start_year": start, "kq_end_year": end, "current_job_title": title, "current_organization": organization,
            "industry": industry, "location": rng.choice(LOCATIONS),
            "headline": rng.choice(HEADLINES[kind]).format(**fields),
            "biography": " ".join([rng.choice(STORY[kind]), rng.choice(NOW), rng.choice(CLOSING[level])]).format(**fields),
            "skills": "|".join(skills), "mentorship_topics": "|".join(topics),
            "available_for_mentorship": rng.random() < AVAILABILITY_RATE[level],
            "consent_to_matching": rng.random() < CONSENT_RATE,
        })
        meta.append({"synthetic_id": synthetic_id, "cohort": "expansion", "experience_level": level,
                     "career_path": destination, "move_type": kind, "title_index": title_index})
    return rows, meta


def evaluation_work_history(rows, meta, departments):
    """KQ role(s), then (when time allows) the previous step on the same path, then the current role."""
    by_id = {m["synthetic_id"]: m for m in meta}
    history = []
    for row in rows:
        rng = random.Random(f"work500:{row['synthetic_id']}")
        info = by_id[row["synthetic_id"]]
        start, end = int(row["kq_start_year"]), int(row["kq_end_year"])
        department = row["former_kq_department"]
        roles = departments[department]["roles"]
        earlier = [role for role in roles if role != row["former_kq_role"] and role not in SENIOR_KQ_ROLES] or \
                  [role for role in roles if role != row["former_kq_role"]]
        if end - start >= 9 and earlier:  # a long KQ career includes an earlier role before the final one
            middle = start + (end - start) // 2
            history.append({"synthetic_id": row["synthetic_id"], "organization": "Kenya Airways", "job_title": rng.choice(earlier),
                            "start_year": start, "end_year": middle, "is_current": False, "description": f"Joined {department}."})
            start = middle
        history.append({"synthetic_id": row["synthetic_id"], "organization": "Kenya Airways", "job_title": row["former_kq_role"],
                        "start_year": start, "end_year": end, "is_current": False, "description": f"{row['former_kq_role']} in {department}."})
        current_start = min(end + rng.randint(0, 1), 2025)
        titles = DESTINATIONS[info["career_path"]][2]
        if info["title_index"] > 0 and 2025 - current_start >= 3:
            previous_end = current_start + max(1, (2025 - current_start) // 2)
            history.append({"synthetic_id": row["synthetic_id"], "organization": rng.choice(DESTINATIONS[info["career_path"]][1]),
                            "job_title": titles[info["title_index"] - 1], "start_year": current_start, "end_year": previous_end,
                            "is_current": False, "description": f"First role in {row['industry'].lower()} after Kenya Airways."})
            current_start = previous_end
        history.append({"synthetic_id": row["synthetic_id"], "organization": row["current_organization"], "job_title": row["current_job_title"],
                        "start_year": current_start, "end_year": "", "is_current": True,
                        "description": f"Current role in {row['industry'].lower()}."})
    return history
