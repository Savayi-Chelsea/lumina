/** Curated fictional presentation fixtures. Never represent live users, matches or listings. */
export type DemoPerson = {
  id: string;
  name: string;
  role: string;
  department: string;
  location: string;
  initials: string;
  tone: "rose" | "sand" | "stone";
  topics: string[];
  story: string;
  demo: true;
};

export const demoPeople: DemoPerson[] = [
  { id: "amina", name: "Amina Kariuki", role: "Aviation operations leader", department: "Flight Operations", location: "Nairobi, Kenya", initials: "AK", tone: "rose", topics: ["Leadership", "Career transitions"], story: "A fictional alumni profile exploring how operational experience can guide a new generation of aviation leaders.", demo: true },
  { id: "brian", name: "Brian Otieno", role: "Cloud & digital transformation", department: "ICT / Digital", location: "Nairobi, Kenya", initials: "BO", tone: "stone", topics: ["Technology", "Career transitions"], story: "A fictional mentor profile for conversations about technology careers, cloud infrastructure and finding your next professional chapter.", demo: true },
  { id: "esther", name: "Esther Mwangi", role: "Finance & strategy advisor", department: "Finance", location: "Mombasa, Kenya", initials: "EM", tone: "sand", topics: ["Finance", "Leadership"], story: "A fictional alumni profile focused on sharing financial insight, strategic thinking and lessons from a career in aviation.", demo: true },
  { id: "terry", name: "Terry Mutua", role: "Customer experience specialist", department: "Cabin Services", location: "Nairobi, Kenya", initials: "TM", tone: "sand", topics: ["Customer experience", "Leadership"], story: "A fictional alumni profile celebrating the people skills, adaptability and care that carry beyond a career in the cabin.", demo: true },
  { id: "daniel", name: "Daniel Kamau", role: "Aircraft maintenance engineer", department: "Engineering & Maintenance", location: "Kisumu, Kenya", initials: "DK", tone: "stone", topics: ["Engineering", "Career transitions"], story: "A fictional professional profile about technical excellence, aviation safety and passing practical knowledge to others.", demo: true },
  { id: "naomi", name: "Naomi Chebet", role: "People & culture consultant", department: "Human Resources", location: "Nakuru, Kenya", initials: "NC", tone: "rose", topics: ["Leadership", "Career transitions"], story: "A fictional alumni profile for discovering how people and culture experience can support meaningful professional change.", demo: true },
];

export const demoEvents = [
  { id: "reunion", title: "Good company. Familiar stories.", category: "Alumni gathering", location: "Nairobi · In person", format: "In person", description: "An illustrative alumni sundowner: an opportunity to reconnect, share stories and meet the people behind familiar names.", demo: true },
  { id: "careers", title: "Your experience. A new direction.", category: "Career conversation", location: "Online · Community conversation", format: "Online", description: "An example conversation about translating an aviation career into new industries and possibilities.", demo: true },
  { id: "leadership", title: "Lessons from the flight deck.", category: "Leadership circle", location: "Online · Mentorship circle", format: "Online", description: "An example small-group discussion about decisions, trust and leadership under pressure.", demo: true },
] as const;

export const demoOpportunities = [
  { id: "advisor", title: "Aviation operations advisor", organization: "Example aviation consultancy", type: "Advisory", location: "Nairobi · Hybrid", description: "An illustrative advisory role drawing on airline operations experience. This is a fictional opportunity, not an open vacancy.", demo: true },
  { id: "mentor", title: "Share your experience as a mentor", organization: "Example community programme", type: "Volunteer", location: "Flexible · Remote", description: "A fictional opportunity to support professionals navigating their next chapter. No applications or enrolments are being collected.", demo: true },
] as const;
