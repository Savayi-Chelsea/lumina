// Clearly labeled illustrative events and opportunities; never directory data.
export const demoEvents = [
  { id: "reunion", title: "Good company. Familiar stories.", category: "Alumni gathering", location: "Nairobi · In person", format: "In person", description: "An illustrative alumni sundowner: an opportunity to reconnect, share stories and meet the people behind familiar names.", demo: true },
  { id: "careers", title: "Your experience. A new direction.", category: "Career conversation", location: "Online · Community conversation", format: "Online", description: "An example conversation about translating an aviation career into new industries and possibilities.", demo: true },
  { id: "leadership", title: "Lessons from the flight deck.", category: "Leadership circle", location: "Online · Mentorship circle", format: "Online", description: "An example small-group discussion about decisions, trust and leadership under pressure.", demo: true },
] as const;

export const demoOpportunities = [
  { id: "advisor", title: "Aviation operations advisor", organization: "Example aviation consultancy", type: "Advisory", location: "Nairobi · Hybrid", description: "An illustrative advisory role drawing on airline operations experience. This is a fictional opportunity, not an open vacancy.", demo: true },
  { id: "mentor", title: "Share your experience as a mentor", organization: "Example community programme", type: "Volunteer", location: "Flexible · Remote", description: "A fictional opportunity to support professionals navigating their next chapter. No applications or enrolments are being collected.", demo: true },
] as const;
