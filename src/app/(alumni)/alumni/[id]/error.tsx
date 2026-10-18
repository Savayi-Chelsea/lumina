"use client";
export default function MentorProfileError({ reset }: { reset: () => void }) {
  return <section className="empty-state"><h1>This profile is temporarily unavailable.</h1><p>Please try again shortly.</p><button type="button" onClick={reset}>Try again</button></section>;
}
