"use client";
export default function NetworkError({ reset }: { reset: () => void }) { return <section className="card"><h1>The Network is taking a pause.</h1><p role="alert">We could not load alumni profiles. Please try again shortly.</p><button onClick={reset}>Try again</button></section>; }
