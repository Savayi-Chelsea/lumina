/**
 * Skills offered in the profile Skills picker, across all fields. Members can
 * still add a skill that is not listed. Kept as a flat list; `skillOptions`
 * sorts and de-duplicates it (case-insensitively) at runtime, so entries here
 * may be grouped by field in any order.
 */
const BY_FIELD: Record<string, string[]> = {
  aviation: [
    "Aircraft Maintenance", "Aircraft Performance", "Aircraft Systems", "Air Cargo Operations", "Air Law", "Air Traffic Control",
    "Airline Operations", "Airline Revenue Management", "Airport Operations", "Airside Safety", "Aviation Leadership", "Aviation Safety",
    "Aviation Security", "Avionics", "Baggage Handling", "Cabin Crew Training", "Cabin Safety", "Charter Operations", "Crew Resource Management",
    "Crew Scheduling", "Dangerous Goods Handling", "Dispatch", "EASA Regulations", "Emergency Procedures", "Fleet Planning",
    "Flight Instruction", "Flight Operations", "Flight Planning", "Flight Safety", "Fuel Management", "Ground Handling", "Human Factors",
    "IATA Regulations", "ICAO Standards", "In-flight Service", "Line Maintenance", "Load Control", "Maintenance Planning",
    "MRO Operations", "Network Planning", "Non-Destructive Testing", "On-Time Performance", "Operations Control", "Passenger Services",
    "Pilot Training", "Ramp Operations", "Route Planning", "Safety Management Systems", "Slot Coordination", "Turnaround Management",
    "Weight and Balance",
  ],
  engineering: [
    "AutoCAD", "Building Information Modelling (BIM)", "CAD Design", "Civil Engineering", "Control Systems", "Electrical Engineering",
    "Electronics", "Engineering Design", "Failure Analysis", "Finite Element Analysis", "HVAC", "Hydraulics", "Industrial Engineering",
    "Instrumentation", "Lean Manufacturing", "Machining", "Manufacturing Engineering", "Materials Engineering", "Mechanical Engineering",
    "Mechatronics", "PLC Programming", "Pneumatics", "Power Systems", "Predictive Maintenance", "Process Engineering", "Product Design",
    "Quality Engineering", "Reliability Engineering", "Root Cause Analysis", "SCADA", "SolidWorks", "Structural Engineering", "Six Sigma",
    "Technical Drawing", "Total Productive Maintenance", "Welding",
  ],
  software: [
    "Agile Methodologies", "Android Development", "Angular", "API Design", "C", "C#", "C++", "Code Review", "Dart", "Django",
    "Embedded Systems", "Express.js", "FastAPI", "Flutter", "Front-End Development", "Full-Stack Development", "Git", "GraphQL", "Go",
    "HTML and CSS", "iOS Development", "Java", "JavaScript", "Kotlin", "Laravel", "Microservices", "Mobile App Development", "Next.js",
    "Node.js", "Object-Oriented Programming", "PHP", "Python", "React", "React Native", "REST APIs", "Ruby on Rails", "Rust", "Scrum",
    "Software Architecture", "Software Development", "Solutions Architecture", "Software Testing", "Spring Boot", "Swift", "Test Automation", "Test-Driven Development",
    "TypeScript", "Unit Testing", "Vue.js", "Web Accessibility", "Web Development",
  ],
  cloud: [
    "Ansible", "AWS", "Azure", "CI/CD", "Cloud Architecture", "Cloud Computing", "Cloud Migration", "Cloud Security", "Containerization",
    "DevOps", "Docker", "Google Cloud Platform", "Infrastructure as Code", "Jenkins", "Kubernetes", "Linux Administration", "Monitoring and Observability",
    "Serverless Computing", "Site Reliability Engineering", "Terraform", "Virtualization", "VMware", "Windows Server",
  ],
  itSupport: [
    "Active Directory", "Database Administration", "Enterprise Architecture", "Help Desk Support", "IT Asset Management", "IT Infrastructure",
    "IT Operations", "IT Project Management", "IT Service Management", "IT Strategy", "ITIL", "Microsoft 365 Administration", "Network Administration",
    "Network Engineering", "Networking", "Oracle Database", "Systems Administration", "Technical Support", "Telecommunications", "Troubleshooting",
  ],
  data: [
    "A/B Testing", "Apache Spark", "Artificial Intelligence", "Big Data", "Business Intelligence", "Computer Vision", "Data Analysis",
    "Data Engineering", "Data Governance", "Data Mining", "Data Modelling", "Data Science", "Data Visualization", "Data Warehousing", "Deep Learning",
    "ETL", "Excel", "Forecasting", "Generative AI", "Looker", "Machine Learning", "MLOps", "Natural Language Processing", "Pandas",
    "PostgreSQL", "Power BI", "Predictive Analytics", "Prompt Engineering", "R", "SAS", "SPSS", "SQL", "Statistics", "Tableau",
  ],
  security: [
    "Business Continuity Planning", "Cybersecurity", "Digital Forensics", "Disaster Recovery", "Ethical Hacking", "Firewall Management",
    "Identity and Access Management", "Incident Response", "Information Security", "ISO 27001", "Network Security", "Penetration Testing",
    "Risk Assessment", "Security Operations", "SIEM", "Threat Intelligence", "Vulnerability Management",
  ],
  finance: [
    "Accounting", "Accounts Payable", "Accounts Receivable", "Actuarial Analysis", "Auditing", "Banking", "Bookkeeping", "Budgeting",
    "Capital Markets", "Cash Flow Management", "Corporate Finance", "Cost Accounting", "Credit Analysis", "Credit Risk", "Debt Collection",
    "Economic Analysis", "Financial Analysis", "Financial Modelling", "Financial Planning", "Financial Reporting", "Fintech", "Forex",
    "Fraud Detection", "IFRS", "Insurance", "Internal Audit", "Investment Analysis", "Investment Banking", "Management Accounting",
    "Microfinance", "Mobile Money", "Payroll", "Portfolio Management", "QuickBooks", "Risk Management", "Revenue Accounting", "Sage",
    "SAP", "Tax Planning", "Taxation", "Treasury Management", "Valuation", "Wealth Management",
  ],
  business: [
    "Business Analysis", "Business Development", "Business Process Improvement", "Business Strategy", "Change Management", "Commercial Awareness",
    "Competitive Analysis", "Consulting", "Contract Management", "Corporate Governance", "Corporate Strategy", "Cost Reduction",
    "Entrepreneurship", "ERP Systems", "Feasibility Studies", "Franchise Management", "General Management", "Governance, Risk and Compliance",
    "KPI Tracking", "Market Research", "Mergers and Acquisitions", "Operations Management", "Organizational Development", "Performance Management",
    "PMP", "PRINCE2", "Process Mapping", "Product Management", "Program Management", "Project Management", "Project Planning", "Quality Management",
    "Regulatory Compliance", "Small Business Management", "Stakeholder Management", "Startup Strategy", "Strategic Planning", "Vendor Management",
  ],
  sales: [
    "Account Management", "Brand Management", "B2B Sales", "Campaign Management", "Content Marketing", "Copywriting", "CRM",
    "Customer Acquisition", "Digital Marketing", "Direct Sales", "Email Marketing", "Event Marketing", "Google Ads", "Growth Marketing",
    "Inside Sales", "Key Account Management", "Lead Generation", "Market Analysis", "Marketing Strategy", "Merchandising", "Negotiation",
    "Partnership Management", "Pricing Strategy", "Product Marketing", "Public Relations", "Retail Management", "Sales Management",
    "Sales Strategy", "Salesforce", "SEO", "Social Media Marketing", "Sponsorship", "Trade Marketing",
  ],
  people: [
    "Coaching", "Compensation and Benefits", "Conflict Resolution", "Diversity and Inclusion", "Employee Engagement", "Employee Relations",
    "Employer Branding", "HR Analytics", "HR Policy", "HRIS", "Human Resources", "Industrial Relations", "Instructional Design",
    "Labour Law", "Learning and Development", "Mentoring", "Onboarding", "Organizational Culture", "Recruitment", "Succession Planning",
    "Talent Acquisition", "Talent Management", "Training Delivery", "Workforce Planning",
  ],
  customer: [
    "Call Centre Operations", "Complaint Handling", "Customer Experience", "Customer Retention", "Customer Service", "Customer Success",
    "Front Office Operations", "Guest Relations", "Hospitality Management", "Hotel Management", "Food and Beverage Management",
    "Front-Line Leadership", "Service Design", "Service Recovery", "Reservations", "Tourism Management", "Travel Management",
    "Event Planning", "Concierge Services", "Housekeeping Management", "Catering", "Culinary Arts", "Restaurant Management",
  ],
  logistics: [
    "Customs Clearance", "Demand Planning", "Distribution", "Fleet Management", "Freight Forwarding", "Import and Export", "Inventory Management",
    "Last-Mile Delivery", "Logistics Management", "Materials Management", "Procurement", "Purchasing", "Shipping", "Sourcing",
    "Supply Chain Management", "Transport Management", "Warehouse Management", "Cold Chain Logistics",
  ],
  health: [
    "Clinical Research", "Community Health", "Emergency Medical Response", "Epidemiology", "First Aid", "Health and Safety", "Healthcare Administration",
    "Medical Records", "Mental Health Support", "Nursing", "Nutrition", "Occupational Health", "Patient Care", "Pharmacy", "Public Health",
    "Physiotherapy", "Health Informatics", "Medical Sales", "Aviation Medicine",
  ],
  education: [
    "Academic Advising", "Adult Education", "Career Counselling", "Classroom Management", "Curriculum Development", "E-Learning",
    "Education Management", "Educational Technology", "Lesson Planning", "Public Speaking", "Research", "Teaching", "Tutoring",
    "Youth Development", "Facilitation",
  ],
  legal: [
    "Commercial Law", "Company Secretarial", "Compliance Management", "Contract Drafting", "Corporate Law", "Data Protection",
    "Employment Law", "Intellectual Property", "Legal Research", "Litigation", "Policy Analysis", "Policy Development", "Anti-Money Laundering",
    "Aviation Law", "Ethics and Integrity",
  ],
  creative: [
    "Adobe Creative Suite", "Adobe Illustrator", "Adobe Photoshop", "Animation", "Art Direction", "Brand Identity", "Content Creation",
    "Creative Writing", "Editing", "Figma", "Graphic Design", "Illustration", "Journalism", "Motion Graphics", "Photography", "Podcasting",
    "Proofreading", "Storytelling", "Technical Writing", "UI Design", "User Research", "UX Design", "Video Editing", "Video Production",
    "Web Design", "Translation", "Interpreting",
  ],
  communication: [
    "Business Writing", "Corporate Communications", "Crisis Communication", "Internal Communications", "Media Relations", "Presentation Skills",
    "Report Writing", "Speech Writing", "Community Management", "Community Engagement", "Fundraising", "Grant Writing", "Advocacy",
    "Donor Relations", "Monitoring and Evaluation", "Non-Profit Management", "Programme Management", "Volunteer Management",
    "Humanitarian Response", "International Development", "Public Administration", "Public Policy", "Diplomacy", "Protocol",
  ],
  trades: [
    "Carpentry", "Construction Management", "Electrical Installation", "Estimating", "Facilities Management", "Interior Design",
    "Land Surveying", "Plumbing", "Property Management", "Quantity Surveying", "Real Estate", "Site Supervision", "Urban Planning",
    "Architecture", "Driving", "Security Management", "Maintenance Management",
  ],
  energy: [
    "Agribusiness", "Agricultural Extension", "Agronomy", "Climate Change Adaptation", "Energy Management", "Environmental Management",
    "Environmental Impact Assessment", "ESG Reporting", "Farm Management", "Horticulture", "Livestock Management", "Oil and Gas",
    "Renewable Energy", "Solar Energy", "Sustainability", "Waste Management", "Water Resources Management", "Carbon Accounting",
  ],
  languages: [
    "Arabic", "English", "French", "German", "Italian", "Kiswahili", "Mandarin Chinese", "Portuguese", "Spanish", "Japanese",
  ],
  personal: [
    "Adaptability", "Analytical Thinking", "Attention to Detail", "Collaboration", "Communication", "Critical Thinking", "Cross-Cultural Communication",
    "Customer Focus", "Decision Making", "Delegation", "Emotional Intelligence", "Influencing", "Innovation", "Leadership", "Mentorship",
    "Multitasking", "Networking", "Organizational Skills", "People Management", "Problem Solving", "Relationship Building", "Resilience",
    "Strategic Thinking", "Team Building", "Team Leadership", "Teamwork", "Time Management", "Working Under Pressure", "Microsoft Office",
    "Google Workspace", "Remote Team Management", "Virtual Collaboration",
  ],
  maritimeAndTransport: [
    "Port Operations", "Maritime Logistics", "Ship Chartering", "Rail Operations", "Public Transport Planning", "Traffic Management",
    "Road Safety", "Automotive Engineering", "Vehicle Maintenance", "Motor Vehicle Inspection", "Drone Operations", "Space Systems",
  ],
  science: [
    "Biotechnology", "Chemistry", "Environmental Science", "Geographic Information Systems (GIS)", "Geology", "Laboratory Management",
    "Laboratory Techniques", "Meteorology", "Microbiology", "Physics", "Quality Control", "Remote Sensing", "Scientific Writing",
    "Food Safety", "Food Science", "Veterinary Medicine", "Mining Engineering", "Mineral Exploration", "Petroleum Engineering",
  ],
  healthAndCare: [
    "Caregiving", "Counselling", "Dentistry", "Elderly Care", "Health Promotion", "Infection Prevention and Control", "Medical Laboratory Science",
    "Midwifery", "Psychology", "Radiography", "Social Work", "Fitness Training", "Sports Coaching", "Sports Management", "Wellness Coaching",
  ],
  retailAndServices: [
    "Beauty and Cosmetology", "Cashiering", "E-commerce", "Fashion Design", "Hairdressing", "Inventory Control", "Point of Sale Systems",
    "Retail Operations", "Store Management", "Visual Merchandising", "Wholesale Distribution", "Customer Loyalty Programmes", "Category Management",
  ],
  mediaAndArts: [
    "Broadcasting", "Film Production", "Music Production", "Radio Presenting", "Sound Engineering", "Television Production", "Theatre",
    "News Writing", "Digital Media", "Influencer Marketing", "Community Radio", "Event Production", "Stage Management",
  ],
  digitalWork: [
    "3D Modelling", "Augmented Reality", "Blockchain", "Chatbot Development", "Cloud Cost Management (FinOps)", "Data Privacy", "Digital Transformation",
    "Internet of Things (IoT)", "Low-Code Development", "No-Code Tools", "Product Analytics", "Robotic Process Automation", "Salesforce Administration",
    "SharePoint", "Technical Project Management", "Unity", "User Acceptance Testing", "Web Analytics", "WordPress", "Zoho CRM", "SAP FICO",
    "Oracle E-Business Suite", "Microsoft Dynamics 365", "Odoo", "Shopify", "Postman", "Jira", "Confluence", "Linux", "Bash Scripting", "PowerShell",
  ],
  aviationMore: [
    "Airport Planning", "Airworthiness", "Aviation Meteorology", "Aviation Training", "Cabin Interior Engineering", "Cargo Sales",
    "CAMO", "Engine Maintenance", "Flight Data Monitoring", "Frequent Flyer Programmes", "Ground Support Equipment", "Inflight Catering",
    "Lounge Operations", "Part-145 Compliance", "Reservations Systems (Amadeus)", "Ticketing", "Yield Management", "Airline Alliances",
    "Codeshare Management", "Air Navigation Services", "Aviation Fuel Handling", "Aircraft Leasing", "Aircraft Painting", "Composite Repair",
  ],
};

export const SKILL_CATALOG: readonly string[] = Object.values(BY_FIELD).flat();

/** A–Z, case-insensitive, with duplicates removed (the first spelling wins). */
export function sortSkills(names: Iterable<string>) {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name.length >= 2 && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true }));
}

/**
 * Filters for the picker: names starting with the query first, then names with a
 * word starting with it, then any other name containing it; each group A–Z.
 * An empty query returns the whole list.
 */
export function searchSkills(options: readonly string[], query: string) {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return [...options];
  const starts: string[] = [], word: string[] = [], contains: string[] = [];
  for (const option of options) {
    const name = option.toLowerCase();
    if (name.startsWith(q)) starts.push(option);
    else if (name.split(/[\s/(),.-]+/).some(part => part.startsWith(q)) || name.includes(` ${q}`)) word.push(option);
    else if (name.includes(q)) contains.push(option);
  }
  return [...starts, ...word, ...contains];
}
