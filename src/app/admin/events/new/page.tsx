import { EventForm } from "@/components/admin-community-forms";

export default function NewEventPage() {
  return <><p className="eyebrow">Administration / Events</p><h1>Create event</h1><p>Times are entered in East Africa Time. Publish when you&apos;re ready for alumni to see it, or save a draft.</p><EventForm /></>;
}
